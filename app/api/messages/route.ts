import { NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
import { BadgeStatus, CourseRole, MessageAudience } from '@prisma/client';

import prisma from '@/lib/prisma';
import { canSendCourseMessages, isInstructorEquivalent, scopeRecipientsToSender } from '@/lib/messaging/audience';
import { buildBlastReceipts, buildDirectReceipts } from '@/lib/messaging/receipts.service';

function normalize(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

type SendMessagePayload = {
  courseId?: string | null;
  // Exactly one of these picks the audience: a single student, every student
  // in the course, or every student who has not finished a given badge.
  recipientId?: string | null;
  allStudents?: boolean | null;
  badgeId?: string | null;
  subject?: string | null;
  body?: string | null;
};

// Everything a sender needs to see about a message they authored: what it was,
// who it was aimed at, and how many of those students have opened it. Staff
// copies are excluded from both counts.
async function sentBox(senderId: string, direction: 'asc' | 'desc') {
  const messages = await prisma.message.findMany({
    where: { senderId },
    orderBy: { createdAt: direction },
    take: 100,
    select: {
      id: true,
      subject: true,
      body: true,
      audience: true,
      createdAt: true,
      course: { select: { title: true } },
      badge: { select: { name: true } },
      // Only meaningful for a DIRECT send, where there is exactly one; a blast
      // is described by its audience and counts instead.
      receipts: {
        where: { isObserver: false },
        take: 1,
        select: { user: { select: { name: true, email: true } } },
      },
    },
  });

  const messageIds = messages.map((message) => message.id);
  // Counted in the database rather than by pulling every receipt back: a
  // class-wide blast has one receipt per student, and there is no reason to
  // ship those rows just to length them.
  const [totals, reads] = messageIds.length
    ? await Promise.all([
        prisma.messageReceipt.groupBy({
          by: ['messageId'],
          where: { messageId: { in: messageIds }, isObserver: false },
          _count: { _all: true },
        }),
        prisma.messageReceipt.groupBy({
          by: ['messageId'],
          where: { messageId: { in: messageIds }, isObserver: false, readAt: { not: null } },
          _count: { _all: true },
        }),
      ])
    : [[], []];

  const totalByMessage = new Map(totals.map((row) => [row.messageId, row._count._all]));
  const readByMessage = new Map(reads.map((row) => [row.messageId, row._count._all]));

  return NextResponse.json(
    {
      count: messages.length,
      messages: messages.map((message) => ({
        id: message.id,
        subject: message.subject,
        body: message.body,
        audience: message.audience,
        createdAt: message.createdAt.toISOString(),
        courseTitle: message.course?.title ?? null,
        badgeName: message.badge?.name ?? null,
        recipientName: message.receipts[0]?.user.name ?? message.receipts[0]?.user.email ?? null,
        recipientCount: totalByMessage.get(message.id) ?? 0,
        readCount: readByMessage.get(message.id) ?? 0,
      })),
    },
    { status: 200 }
  );
}

// GET: the signed-in user's mail. ?box=sent returns what they authored, anything
// else what reached them; ?order=oldest flips the default newest-first sort.
export async function GET(req: Request) {
  try {
    const clerkUser = await currentUser();
    const email = clerkUser?.emailAddresses?.[0]?.emailAddress?.trim().toLowerCase();
    if (!email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const recipient = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (!recipient) {
      return NextResponse.json({ count: 0, messages: [] }, { status: 200 });
    }

    const params = new URL(req.url).searchParams;
    const direction = params.get('order') === 'oldest' ? 'asc' : 'desc';

    if (params.get('box') === 'sent') {
      return await sentBox(recipient.id, direction);
    }

    // Receipts are what this user can see; the message body is shared with
    // everyone else the same send reached.
    const receipts = await prisma.messageReceipt.findMany({
      where: { userId: recipient.id },
      orderBy: { createdAt: direction },
      take: 100,
      select: {
        readAt: true,
        message: {
          select: {
            id: true,
            subject: true,
            body: true,
            audience: true,
            createdAt: true,
            sender: { select: { name: true, email: true } },
            course: { select: { title: true, createdBy: { select: { name: true } } } },
            badge: { select: { name: true } },
          },
        },
      },
    });

    return NextResponse.json(
      {
        count: receipts.length,
        messages: receipts.map(({ readAt, message }) => ({
          id: message.id,
          subject: message.subject,
          body: message.body,
          audience: message.audience,
          read: readAt != null,
          createdAt: message.createdAt.toISOString(),
          // Prefer the sender's own name; fall back to the course's instructor
          // (its creator) so a real name shows even if the sender has none saved.
          senderName: message.sender?.name ?? message.course?.createdBy?.name ?? null,
          courseTitle: message.course?.title ?? null,
          badgeName: message.badge?.name ?? null,
        })),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('GET /api/messages failed:', error);
    return NextResponse.json({ error: 'Failed to load messages.' }, { status: 500 });
  }
}

// POST: send a message from a course instructor/checker to one student, to every
// student in the course, or to everyone still short of a badge. Only the course
// creator or an enrolled INSTRUCTOR/CHECKER may send; CHECKERs additionally
// require the course's allowCheckerMessages setting to be enabled.
export async function POST(req: Request) {
  try {
    const clerkUser = await currentUser();
    const email = clerkUser?.emailAddresses?.[0]?.emailAddress?.trim().toLowerCase();
    if (!email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sender = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (!sender) {
      return NextResponse.json({ error: 'User record not found.' }, { status: 404 });
    }

    const payload = (await req.json().catch(() => ({}))) as SendMessagePayload;
    const courseId = normalize(payload.courseId);
    const body = normalize(payload.body);
    const subject = normalize(payload.subject) ?? 'Message from your instructor';
    const recipientId = normalize(payload.recipientId);
    const badgeId = normalize(payload.badgeId);
    const allStudents = payload.allStudents === true;

    if (!courseId) {
      return NextResponse.json({ error: 'A courseId is required.' }, { status: 400 });
    }
    if (!body) {
      return NextResponse.json({ error: 'Message body is required.' }, { status: 400 });
    }
    if (!recipientId && !badgeId && !allStudents) {
      return NextResponse.json({ error: 'Specify a recipientId, a badgeId, or set allStudents.' }, { status: 400 });
    }

    const course = await prisma.course.findFirst({
      where: {
        id: courseId,
        OR: [
          { createdById: sender.id },
          {
            enrollments: {
              some: { studentId: sender.id, role: { in: [CourseRole.INSTRUCTOR, CourseRole.CHECKER] } },
            },
          },
        ],
      },
      select: {
        createdById: true,
        settings: { select: { allowCheckerMessages: true, allowCrossSectionView: true } },
        enrollments: {
          where: { studentId: sender.id },
          select: { role: true, sections: { select: { section: true } } },
        },
      },
    });
    if (!course) {
      return NextResponse.json({ error: 'Course not found or you do not have permission.' }, { status: 403 });
    }

    const senderEnrollment = course.enrollments[0] ?? null;
    const standing = {
      isCreator: course.createdById === sender.id,
      role: senderEnrollment?.role ?? null,
    };
    const senderSections = senderEnrollment?.sections.map((assignment) => assignment.section) ?? [];

    // A CHECKER who is not the course creator may only message while the course
    // allows checker messages.
    if (!canSendCourseMessages(standing, course.settings?.allowCheckerMessages ?? false)) {
      return NextResponse.json({ error: 'Checker messaging is disabled for this course.' }, { status: 403 });
    }

    const audience = recipientId
      ? MessageAudience.DIRECT
      : badgeId
        ? MessageAudience.BADGE_INCOMPLETE
        : MessageAudience.ALL_STUDENTS;

    // Messaging the entire course is an instructor's call alone. Unlike the 1:1
    // and badge audiences, no course setting opens this one to checkers.
    if (audience === MessageAudience.ALL_STUDENTS && !isInstructorEquivalent(standing)) {
      return NextResponse.json({ error: 'Only an instructor can message the whole course.' }, { status: 403 });
    }

    // Resolve recipients: a single enrolled student, or all enrolled students,
    // then narrow to the sections this sender may reach.
    const studentEnrollments = await prisma.enrollment.findMany({
      where: {
        courseId,
        role: CourseRole.STUDENT,
        ...(recipientId ? { studentId: recipientId } : {}),
      },
      select: { studentId: true, sections: { select: { section: true } } },
    });
    let recipientIds = scopeRecipientsToSender(
      studentEnrollments.map((enrollment) => ({
        studentId: enrollment.studentId,
        sections: enrollment.sections.map((assignment) => assignment.section),
      })),
      { sender: standing, senderSections, allowCrossSectionView: course.settings?.allowCrossSectionView ?? false }
    ).map((recipient) => recipient.studentId);

    // Same 404 whether the target is not a student here or simply outside the
    // sender's sections, so a checker can't probe the roster of other sections.
    if (recipientId && recipientIds.length === 0) {
      return NextResponse.json({ error: 'Recipient is not a student in this course.' }, { status: 404 });
    }

    // A badge-scoped blast drops everyone who already finished it. Deliberately
    // blunt: students who never started, or whose badge is locked or awaiting
    // review, all still count as "not completed".
    if (audience === MessageAudience.BADGE_INCOMPLETE && badgeId && recipientIds.length > 0) {
      const completed = await prisma.studentBadge.findMany({
        where: { badgeId, studentId: { in: recipientIds }, status: BadgeStatus.COMPLETED },
        select: { studentId: true },
      });
      const completedIds = new Set(completed.map((row) => row.studentId));
      recipientIds = recipientIds.filter((id) => !completedIds.has(id));
    }

    if (recipientIds.length === 0) {
      return NextResponse.json({ sent: 0 }, { status: 200 });
    }

    // A blast copies course staff as observers; a 1:1 stays between the two
    // people on it.
    const receipts = recipientId
      ? buildDirectReceipts(recipientIds)
      : await buildBlastReceipts({ courseId, authorId: sender.id, studentIds: recipientIds });

    // One authored row plus a receipt per recipient, written together so a
    // message can never exist with a partial audience.
    await prisma.message.create({
      data: {
        senderId: sender.id,
        courseId,
        badgeId,
        audience,
        subject,
        body,
        receipts: { create: receipts },
      },
      select: { id: true },
    });

    // The reported count is students reached, not receipts written — staff
    // copies are not "sends".
    return NextResponse.json({ sent: recipientIds.length }, { status: 201 });
  } catch (error) {
    console.error('POST /api/messages failed:', error);
    return NextResponse.json({ error: 'Failed to send message.' }, { status: 500 });
  }
}
