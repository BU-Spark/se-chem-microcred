import { NextRequest, NextResponse } from 'next/server';
import { CourseRole } from '@prisma/client';

import { ensureCurrentUser } from '@/app/api/courses/lib/ensure-user';
import prisma from '@/lib/prisma';

type Context = { params: Promise<{ courseId: string; enrollmentId: string }> };

function parseSections(value: unknown) {
  const entries = Array.isArray(value) ? value : typeof value === 'string' ? value.split('|') : [];
  return Array.from(
    new Set(
      entries
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter(Boolean)
    )
  );
}

export async function PUT(req: NextRequest, context: Context) {
  try {
    const user = await ensureCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { courseId, enrollmentId } = await context.params;
    const body = (await req.json()) as { sections?: unknown };
    const sections = parseSections(body.sections);

    const enrollment = await prisma.enrollment.findFirst({
      where: { id: enrollmentId, courseId, status: 'ACTIVE', course: { createdById: user.id } },
      select: { id: true, role: true },
    });
    if (!enrollment || (enrollment.role !== CourseRole.STUDENT && enrollment.role !== CourseRole.CHECKER)) {
      return NextResponse.json({ error: 'Roster member not found or you cannot manage this course.' }, { status: 404 });
    }
    if (enrollment.role === CourseRole.STUDENT && sections.length > 1) {
      return NextResponse.json({ error: 'Students can only belong to one section.' }, { status: 400 });
    }

    await prisma.$transaction([
      prisma.enrollmentSection.deleteMany({ where: { enrollmentId } }),
      ...(sections.length
        ? [prisma.enrollmentSection.createMany({ data: sections.map((section) => ({ enrollmentId, section })) })]
        : []),
    ]);

    return NextResponse.json({ message: 'Sections updated.', sections });
  } catch (error) {
    console.error('PUT enrollment sections failed:', error);
    return NextResponse.json({ error: 'Unable to update sections.' }, { status: 500 });
  }
}
