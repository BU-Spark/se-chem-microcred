import { NextRequest, NextResponse } from 'next/server';
import { CourseRole, Prisma } from '@prisma/client';

import { ensureCurrentUser } from '@/app/api/courses/lib/ensure-user';
import prisma from '@/lib/prisma';

type JoinCoursePayload = {
  code?: string | null;
};

function normalizeCourseCode(value?: string | null) {
  const normalized =
    value
      ?.trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '') ?? '';
  return normalized || null;
}

export async function POST(req: NextRequest) {
  try {
    const user = await ensureCurrentUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = (await req.json().catch(() => ({}))) as JoinCoursePayload;
    const code = normalizeCourseCode(payload.code);

    if (!code) {
      return NextResponse.json({ error: 'Course code is required.' }, { status: 400 });
    }

    const course = await prisma.course.findFirst({
      where: { code },
      select: {
        id: true,
        title: true,
        code: true,
        createdById: true,
        enrollments: {
          where: { studentId: user.id },
          select: { id: true, role: true },
          take: 1,
        },
      },
    });

    if (!course) {
      return NextResponse.json({ error: 'No course was found for that code.' }, { status: 404 });
    }

    if (course.createdById === user.id) {
      return NextResponse.json({ error: 'You already own this course.' }, { status: 409 });
    }

    const existingEnrollment = course.enrollments[0] ?? null;

    if (existingEnrollment?.role === CourseRole.STUDENT) {
      return NextResponse.json(
        {
          message: 'You are already enrolled in this course.',
          course: {
            id: course.id,
            title: course.title,
            code: course.code,
          },
          enrollment: existingEnrollment,
          alreadyEnrolled: true,
        },
        { status: 200 }
      );
    }

    if (existingEnrollment) {
      return NextResponse.json(
        { error: 'You already have a staff role in this course and cannot join it as a student.' },
        { status: 409 }
      );
    }

    const enrollment = await prisma.enrollment.create({
      data: {
        studentId: user.id,
        courseId: course.id,
        role: CourseRole.STUDENT,
      },
      select: {
        id: true,
        role: true,
      },
    });

    return NextResponse.json(
      {
        message: `You joined ${course.title}.`,
        course: {
          id: course.id,
          title: course.title,
          code: course.code,
        },
        enrollment,
        alreadyEnrolled: false,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('POST /api/courses/join failed:', error);

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ error: 'You are already enrolled in this course.' }, { status: 409 });
    }

    return NextResponse.json({ error: 'Failed to join course.' }, { status: 500 });
  }
}
