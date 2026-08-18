import { NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
import { CourseRole, MessageAudience } from '@prisma/client';

import prisma from '@/lib/prisma';
import { canSendCourseMessages, scopeRecipientsToSender } from '@/lib/messaging/audience';

function normalize(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

type SendMessagePayload = {
  courseId?: string | null;
  // Send to a single student, or to every student in the course.
  recipientId?: string | null;
  allStudents?: boolean | null;
  subject?: string | null;
  body?: string | null;
};

// GET: the signed-in user's received messages, newest first.
export async function GET() {
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

    // Receipts are what this user can see; the message body is shared with
    // everyone else the same send reached.
    const receipts = await prisma.messageReceipt.findMany({
      where: { userId: recipient.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        readAt: true,
        message: {
          select: {
            id: true,
            subject: true,
            body: true,
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

// POST: send a message from a course instructor/checker to one student or to
// every student in the course. Only the course creator or an enrolled
// INSTRUCTOR/CHECKER may send; CHECKERs additionally require the course's
// allowCheckerMessages setting to be enabled.
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
    const allStudents = payload.allStudents === true;

    if (!courseId) {
      return NextResponse.json({ error: 'A courseId is required.' }, { status: 400 });
    }
    if (!body) {
      return NextResponse.json({ error: 'Message body is required.' }, { status: 400 });
    }
    if (!recipientId && !allStudents) {
      return NextResponse.json({ error: 'Specify a recipientId or set allStudents.' }, { status: 400 });
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

    if (!canSendCourseMessages(standing, course.settings?.allowCheckerMessages ?? false)) {
      return NextResponse.json({ error: 'Checker messaging is disabled for this course.' }, { status: 403 });
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
    const recipientIds = scopeRecipientsToSender(
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
    if (recipientIds.length === 0) {
      return NextResponse.json({ sent: 0 }, { status: 200 });
    }

    // One authored row plus a receipt per recipient, written together so a
    // message can never exist with a partial audience.
    await prisma.message.create({
      data: {
        senderId: sender.id,
        courseId,
        audience: recipientId ? MessageAudience.DIRECT : MessageAudience.ALL_STUDENTS,
        subject,
        body,
        receipts: { create: recipientIds.map((userId) => ({ userId })) },
      },
      select: { id: true },
    });

    return NextResponse.json({ sent: recipientIds.length }, { status: 201 });
  } catch (error) {
    console.error('POST /api/messages failed:', error);
    return NextResponse.json({ error: 'Failed to send message.' }, { status: 500 });
  }
}
