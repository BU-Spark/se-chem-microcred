import { NextRequest, NextResponse } from 'next/server';
import { CourseRole } from '@prisma/client';
import { ensureCurrentUser } from '@/app/api/courses/lib/ensure-user';
import prisma from '@/lib/prisma';

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ courseId: string; assessorId: string }> }
) {
  try {
    const { courseId, assessorId } = await context.params;
    if (!courseId?.trim() || !assessorId?.trim())
      return NextResponse.json({ error: 'Course id and assessor id are required.' }, { status: 400 });
    const user = await ensureCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const enrollment = await prisma.enrollment.findFirst({
      where: { courseId, studentId: assessorId, role: CourseRole.CHECKER, course: { createdById: user.id } },
      select: { id: true },
    });
    if (!enrollment)
      return NextResponse.json(
        { error: 'Assessor is not enrolled or you cannot manage this course.' },
        { status: 404 }
      );
    await prisma.enrollment.delete({ where: { id: enrollment.id } });
    return NextResponse.json({ message: 'Assessor removed from course.' });
  } catch (error) {
    console.error('DELETE course assessor failed:', error);
    return NextResponse.json({ error: 'Failed to remove assessor from course.' }, { status: 500 });
  }
}
