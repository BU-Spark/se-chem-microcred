import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
import { BadgeStatus, CourseRole, MessageAudience } from '@prisma/client';

import prisma from '@/lib/prisma';
import { canSendCourseMessages, scopeRecipientsToSender } from '@/lib/messaging/audience';
import { buildBlastReceipts } from '@/lib/messaging/receipts.service';

type ReminderPayload = {
  subject?: string | null;
  body?: string | null;
};

function normalize(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

// POST: send a lesson reminder to every STUDENT in the course whose badge is
// not yet COMPLETED. Only the course creator or an INSTRUCTOR/CHECKER may send,
// and a CHECKER additionally needs the course's allowCheckerMessages setting —
// a reminder is a message, so it answers to the same switch as /api/messages.
export async function POST(req: NextRequest, { params }: { params: Promise<{ courseId: string; badgeId: string }> }) {
  try {
    const { courseId, badgeId } = await params;

    const clerkUser = await currentUser();
    const email = clerkUser?.emailAddresses?.[0]?.emailAddress?.trim().toLowerCase();
    if (!email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sender = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (!sender) {
      return NextResponse.json({ error: 'User record not found.' }, { status: 404 });
    }

    // Authorize: creator OR an instructor/checker enrolled in the course.
    const course = await prisma.course.findFirst({
      where: {
        id: courseId,
        OR: [
          { createdById: sender.id },
          {
            enrollments: { some: { studentId: sender.id, role: { in: [CourseRole.INSTRUCTOR, CourseRole.CHECKER] } } },
          },
        ],
      },
      select: {
        id: true,
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

    const payload = (await req.json().catch(() => ({}))) as ReminderPayload;
    const body = normalize(payload.body);
    const subject = normalize(payload.subject) ?? 'Lesson reminder';
    if (!body) {
      return NextResponse.json({ error: 'Message body is required.' }, { status: 400 });
    }

    // Enrolled students in the course, narrowed to the sections this sender may
    // reach (a checker without cross-section view only reminds their own).
    const studentEnrollments = await prisma.enrollment.findMany({
      where: { courseId, role: CourseRole.STUDENT },
      select: { studentId: true, sections: { select: { section: true } } },
    });
    const studentIds = scopeRecipientsToSender(
      studentEnrollments.map((enrollment) => ({
        studentId: enrollment.studentId,
        sections: enrollment.sections.map((assignment) => assignment.section),
      })),
      { sender: standing, senderSections, allowCrossSectionView: course.settings?.allowCrossSectionView ?? false }
    ).map((recipient) => recipient.studentId);

    if (studentIds.length === 0) {
      return NextResponse.json({ sent: 0 }, { status: 200 });
    }

    // Students who have already COMPLETED this badge are excluded.
    const completed = await prisma.studentBadge.findMany({
      where: { badgeId, studentId: { in: studentIds }, status: BadgeStatus.COMPLETED },
      select: { studentId: true },
    });
    const completedIds = new Set(completed.map((row) => row.studentId));
    const recipientIds = studentIds.filter((id) => !completedIds.has(id));

    if (recipientIds.length === 0) {
      return NextResponse.json({ sent: 0 }, { status: 200 });
    }

    const receipts = await buildBlastReceipts({ courseId, authorId: sender.id, studentIds: recipientIds });

    await prisma.message.create({
      data: {
        senderId: sender.id,
        courseId,
        badgeId,
        audience: MessageAudience.BADGE_INCOMPLETE,
        subject,
        body,
        receipts: { create: receipts },
      },
      select: { id: true },
    });

    return NextResponse.json({ sent: recipientIds.length }, { status: 201 });
  } catch (error) {
    console.error('POST reminders failed:', error);
    return NextResponse.json({ error: 'Failed to send reminders.' }, { status: 500 });
  }
}
