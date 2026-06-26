import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
import { BadgeStatus, CourseRole } from '@prisma/client';

import prisma from '@/lib/prisma';

type ReminderPayload = {
  subject?: string | null;
  body?: string | null;
};

function normalize(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

// POST: send a lesson reminder to every STUDENT in the course whose badge is
// not yet COMPLETED. Only the course creator or an INSTRUCTOR/CHECKER may send.
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
      select: { id: true },
    });
    if (!course) {
      return NextResponse.json({ error: 'Course not found or you do not have permission.' }, { status: 403 });
    }

    const payload = (await req.json().catch(() => ({}))) as ReminderPayload;
    const body = normalize(payload.body);
    const subject = normalize(payload.subject) ?? 'Lesson reminder';
    if (!body) {
      return NextResponse.json({ error: 'Message body is required.' }, { status: 400 });
    }

    // Enrolled students in the course.
    const studentEnrollments = await prisma.enrollment.findMany({
      where: { courseId, role: CourseRole.STUDENT },
      select: { studentId: true },
    });
    const studentIds = studentEnrollments.map((enrollment) => enrollment.studentId);

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

    await prisma.message.createMany({
      data: recipientIds.map((recipientId) => ({
        recipientId,
        senderId: sender.id,
        courseId,
        badgeId,
        subject,
        body,
      })),
    });

    return NextResponse.json({ sent: recipientIds.length }, { status: 201 });
  } catch (error) {
    console.error('POST reminders failed:', error);
    return NextResponse.json({ error: 'Failed to send reminders.' }, { status: 500 });
  }
}
