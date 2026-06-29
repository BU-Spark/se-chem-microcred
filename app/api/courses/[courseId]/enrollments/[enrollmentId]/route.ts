import { NextRequest, NextResponse } from 'next/server';
import { CourseRole, EnrollmentStatus } from '@prisma/client';

import { ensureCurrentUser } from '@/app/api/courses/lib/ensure-user';
import prisma from '@/lib/prisma';

type RouteContext = { params: Promise<{ courseId: string; enrollmentId: string }> };

// Confirm the signed-in user owns the course and the target enrollment is a
// pending assessor (CHECKER) request on it. Returns the enrollment id, or an
// error response to short-circuit with.
async function loadPendingAssessor(courseId: string, enrollmentId: string) {
  const user = await ensureCurrentUser();
  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  // Only the course creator (instructor) may approve/decline assessor requests.
  const course = await prisma.course.findFirst({
    where: { id: courseId, createdById: user.id },
    select: { id: true },
  });
  if (!course) {
    return {
      error: NextResponse.json(
        { error: 'Course not found or you do not have permission to manage it.' },
        { status: 404 }
      ),
    };
  }

  const enrollment = await prisma.enrollment.findFirst({
    where: {
      id: enrollmentId,
      courseId,
      role: CourseRole.CHECKER,
      status: EnrollmentStatus.PENDING,
    },
    select: { id: true },
  });
  if (!enrollment) {
    return { error: NextResponse.json({ error: 'Pending assessor request not found.' }, { status: 404 }) };
  }

  return { enrollmentId: enrollment.id };
}

// Approve a pending assessor: flip the enrollment to ACTIVE.
export async function PATCH(_req: NextRequest, context: RouteContext) {
  try {
    const { courseId, enrollmentId } = await context.params;
    const result = await loadPendingAssessor(courseId, enrollmentId);
    if ('error' in result) return result.error;

    const enrollment = await prisma.enrollment.update({
      where: { id: result.enrollmentId },
      data: { status: EnrollmentStatus.ACTIVE },
      select: { id: true, role: true, status: true },
    });

    return NextResponse.json({ message: 'Assessor approved.', enrollment }, { status: 200 });
  } catch (error) {
    console.error('PATCH /api/courses/[courseId]/enrollments/[enrollmentId] failed:', error);
    return NextResponse.json({ error: 'Failed to approve assessor.' }, { status: 500 });
  }
}

// Decline a pending assessor: remove the request.
export async function DELETE(_req: NextRequest, context: RouteContext) {
  try {
    const { courseId, enrollmentId } = await context.params;
    const result = await loadPendingAssessor(courseId, enrollmentId);
    if ('error' in result) return result.error;

    await prisma.enrollment.delete({ where: { id: result.enrollmentId } });

    return NextResponse.json({ message: 'Assessor request declined.' }, { status: 200 });
  } catch (error) {
    console.error('DELETE /api/courses/[courseId]/enrollments/[enrollmentId] failed:', error);
    return NextResponse.json({ error: 'Failed to decline assessor.' }, { status: 500 });
  }
}
