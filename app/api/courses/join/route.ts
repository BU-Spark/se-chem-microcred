import { NextRequest, NextResponse } from 'next/server';
import { CourseRole, EnrollmentStatus, Prisma } from '@prisma/client';

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

    // A course has two separate join codes: `code` (students) and `assessorCode`
    // (assessors / CHECKER role). Codes are unique across both columns, so the
    // matched column tells us which role this code grants.
    const course = await prisma.course.findFirst({
      where: { OR: [{ code }, { assessorCode: code }] },
      select: {
        id: true,
        title: true,
        code: true,
        assessorCode: true,
        createdById: true,
        enrollments: {
          where: { studentId: user.id },
          select: { id: true, role: true, status: true },
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

    const joinRole = course.assessorCode === code ? CourseRole.CHECKER : CourseRole.STUDENT;
    const roleLabel = joinRole === CourseRole.CHECKER ? 'an assessor' : 'a student';
    const isAssessorJoin = joinRole === CourseRole.CHECKER;
    const courseSummary = { id: course.id, title: course.title, code: course.code };

    const existingEnrollment = course.enrollments[0] ?? null;

    if (existingEnrollment?.role === joinRole) {
      // Same role already on record — distinguish a still-pending assessor request
      // from an active membership.
      if (isAssessorJoin && existingEnrollment.status === EnrollmentStatus.PENDING) {
        return NextResponse.json(
          {
            message: 'Your assessor request is already pending the instructor’s approval.',
            course: courseSummary,
            enrollment: existingEnrollment,
            pending: true,
            alreadyRequested: true,
          },
          { status: 200 }
        );
      }

      return NextResponse.json(
        {
          message: isAssessorJoin
            ? 'You are already an assessor for this course.'
            : 'You are already enrolled in this course.',
          course: courseSummary,
          enrollment: existingEnrollment,
          alreadyEnrolled: true,
        },
        { status: 200 }
      );
    }

    if (existingEnrollment) {
      return NextResponse.json(
        { error: `You already have a different role in this course and cannot join it as ${roleLabel}.` },
        { status: 409 }
      );
    }

    // Assessors don't join immediately — they create a pending request the
    // instructor approves on their assessor roster. Students still join directly.
    const enrollment = await prisma.enrollment.create({
      data: {
        studentId: user.id,
        courseId: course.id,
        role: joinRole,
        status: isAssessorJoin ? EnrollmentStatus.PENDING : EnrollmentStatus.ACTIVE,
      },
      select: {
        id: true,
        role: true,
        status: true,
      },
    });

    if (isAssessorJoin) {
      return NextResponse.json(
        {
          message: `Request sent to ${course.title} — waiting for the instructor to approve you as an assessor.`,
          course: courseSummary,
          enrollment,
          pending: true,
          alreadyEnrolled: false,
        },
        { status: 201 }
      );
    }

    return NextResponse.json(
      {
        message: `You joined ${course.title} as ${roleLabel}.`,
        course: courseSummary,
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
