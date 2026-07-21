import { BadgeStatus, Prisma } from '@prisma/client';
import { randomInt } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

import { ensureCurrentUser } from '@/app/api/courses/lib/ensure-user';
import { syncLessonBadgesForStudent } from '@/lib/badgeProgress';
import { isCoolingDown } from '@/lib/badgeState';
import prisma from '@/lib/prisma';

const CODE_TTL_MS = 30 * 60 * 1000;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;

type AssessmentCodePayload = {
  courseId?: string | null;
  badgeId?: string | null;
};

function normalizeId(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function formatCode(code: string) {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

function generateAssessmentCode() {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

async function createUniqueCode({
  courseId,
  studentId,
  badgeId,
  expiresAt,
}: {
  courseId: string;
  studentId: string;
  badgeId: string;
  expiresAt: Date;
}) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await prisma.assessmentAccessCode.create({
        data: {
          code: generateAssessmentCode(),
          courseId,
          studentId,
          badgeId,
          expiresAt,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        continue;
      }
      throw error;
    }
  }

  throw new Error('Unable to generate a unique assessment code.');
}

export async function POST(req: NextRequest) {
  try {
    const student = await ensureCurrentUser();

    if (!student) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await req.json()) as AssessmentCodePayload;
    const courseId = normalizeId(body.courseId);
    const badgeId = normalizeId(body.badgeId);

    if (!courseId || !badgeId) {
      return NextResponse.json({ error: 'Course id and badge id are required.' }, { status: 400 });
    }

    const courseBadge = await prisma.course.findFirst({
      where: {
        id: courseId,
        enrollments: { some: { studentId: student.id } },
        lessons: {
          some: {
            badgeRequirements: {
              some: { badgeId },
            },
          },
        },
      },
      select: {
        id: true,
        lessons: {
          where: {
            badgeRequirements: {
              some: { badgeId },
            },
          },
          select: { id: true },
        },
      },
    });

    if (!courseBadge) {
      return NextResponse.json(
        { error: 'Badge is not available for this student in the requested course.' },
        { status: 403 }
      );
    }

    if (courseBadge.lessons.length > 0) {
      await prisma.$transaction(async (tx) => {
        for (const lesson of courseBadge.lessons) {
          await syncLessonBadgesForStudent(tx, { studentId: student.id, lessonId: lesson.id });
        }
      });
    }

    const studentBadge = await prisma.studentBadge.findUnique({
      where: {
        studentId_badgeId: {
          studentId: student.id,
          badgeId,
        },
      },
      select: { status: true, cooldownUntil: true },
    });

    if (!studentBadge) {
      return NextResponse.json({ error: 'Badge is not assigned to this student.' }, { status: 403 });
    }

    if (studentBadge.status !== BadgeStatus.READY_FOR_ASSESSMENT) {
      return NextResponse.json({ error: 'Badge is not ready for assessment.' }, { status: 409 });
    }

    // Reassessment is gated by the cooldown window: block while now < cooldownUntil.
    if (isCoolingDown(studentBadge.cooldownUntil)) {
      return NextResponse.json({ error: 'Badge is in its reassessment cooldown period.' }, { status: 409 });
    }

    const now = new Date();
    const existingCode = await prisma.assessmentAccessCode.findFirst({
      where: {
        courseId,
        studentId: student.id,
        badgeId,
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (existingCode) {
      return NextResponse.json({
        code: formatCode(existingCode.code),
        expiresAt: existingCode.expiresAt.toISOString(),
      });
    }

    await prisma.assessmentAccessCode.deleteMany({
      where: {
        OR: [{ expiresAt: { lte: now } }, { courseId, studentId: student.id, badgeId }],
      },
    });

    const savedCode = await createUniqueCode({
      courseId,
      studentId: student.id,
      badgeId,
      expiresAt: new Date(now.getTime() + CODE_TTL_MS),
    });

    return NextResponse.json({
      code: formatCode(savedCode.code),
      expiresAt: savedCode.expiresAt.toISOString(),
    });
  } catch (error) {
    console.error('POST /api/assessment-codes failed:', error);
    return NextResponse.json({ error: 'Failed to create assessment code.' }, { status: 500 });
  }
}
