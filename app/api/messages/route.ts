import { NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
import { CourseRole } from '@prisma/client';

import prisma from '@/lib/prisma';

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

    const messages = await prisma.message.findMany({
      where: { recipientId: recipient.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        subject: true,
        body: true,
        readAt: true,
        createdAt: true,
        sender: { select: { name: true, email: true } },
        course: { select: { title: true } },
        badge: { select: { name: true } },
      },
    });

    return NextResponse.json(
      {
        count: messages.length,
        messages: messages.map((message) => ({
          id: message.id,
          subject: message.subject,
          body: message.body,
          read: message.readAt != null,
          createdAt: message.createdAt.toISOString(),
          senderName: message.sender?.name ?? null,
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
// allowAssessorMessages setting to be enabled.
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

    // Authorize the sender against the course and capture their role so we can
    // enforce the assessor-messaging setting for CHECKERs.
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
        settings: { select: { allowAssessorMessages: true } },
        enrollments: {
          where: { studentId: sender.id },
          select: { role: true },
        },
      },
    });
    if (!course) {
      return NextResponse.json({ error: 'Course not found or you do not have permission.' }, { status: 403 });
    }

    // A CHECKER (assessor) who is not the course creator may only message when
    // the course allows assessor messages.
    const isCreator = course.createdById === sender.id;
    const isChecker = course.enrollments.some((enrollment) => enrollment.role === CourseRole.CHECKER);
    const isInstructor = course.enrollments.some((enrollment) => enrollment.role === CourseRole.INSTRUCTOR);
    if (!isCreator && !isInstructor && isChecker && !course.settings?.allowAssessorMessages) {
      return NextResponse.json({ error: 'Assessor messaging is disabled for this course.' }, { status: 403 });
    }

    // Resolve recipients: a single enrolled student, or all enrolled students.
    const studentEnrollments = await prisma.enrollment.findMany({
      where: {
        courseId,
        role: CourseRole.STUDENT,
        ...(recipientId ? { studentId: recipientId } : {}),
      },
      select: { studentId: true },
    });
    const recipientIds = studentEnrollments.map((enrollment) => enrollment.studentId);

    if (recipientId && recipientIds.length === 0) {
      return NextResponse.json({ error: 'Recipient is not a student in this course.' }, { status: 404 });
    }
    if (recipientIds.length === 0) {
      return NextResponse.json({ sent: 0 }, { status: 200 });
    }

    await prisma.message.createMany({
      data: recipientIds.map((id) => ({
        recipientId: id,
        senderId: sender.id,
        courseId,
        subject,
        body,
      })),
    });

    return NextResponse.json({ sent: recipientIds.length }, { status: 201 });
  } catch (error) {
    console.error('POST /api/messages failed:', error);
    return NextResponse.json({ error: 'Failed to send message.' }, { status: 500 });
  }
}
