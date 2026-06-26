import { NextRequest, NextResponse } from 'next/server';
import { BadgeStatus } from '@prisma/client';
import { currentUser } from '@clerk/nextjs/server';

import { fetchUserByEmail } from '@/app/api/courses/lib/course-queries';
import prisma from '@/lib/prisma';

function normalizeEmail(email?: string | null) {
  const trimmed = email?.trim().toLowerCase();
  return trimmed ? trimmed : null;
}

function normalizeId(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

// The acting user's email arrives as a client-supplied query param; require it
// to match the signed-in Clerk session so a caller can't act as someone else.
async function sessionMatchesEmail(email: string) {
  const clerkUser = await currentUser();
  const sessionEmail = normalizeEmail(clerkUser?.emailAddresses?.[0]?.emailAddress);
  return Boolean(sessionEmail) && sessionEmail === email;
}

function answerTextFromResponse(options: unknown, selectedIndex?: number | null) {
  if (selectedIndex == null) {
    return 'No answer recorded';
  }

  if (Array.isArray(options) && selectedIndex >= 0 && selectedIndex < options.length) {
    return String(options[selectedIndex]);
  }

  return `Option ${selectedIndex + 1}`;
}

function formatCheckpointLabel(label: string | null | undefined, sortOrder: number) {
  const trimmed = label?.trim();
  const serialNumber = sortOrder + 1;

  if (!trimmed || /^checkpoint$/i.test(trimmed)) {
    return `Checkpoint ${serialNumber}`;
  }

  return trimmed;
}

function parseRequirementSummary(summary?: string | null) {
  if (!summary?.trim()) {
    return { gradingCriteria: [] as Array<{ number?: number; criterion: string; options: string[] }> };
  }

  try {
    const parsed = JSON.parse(summary) as {
      gradingCriteria?: Array<{
        number?: number;
        criterion?: string;
        options?: string[];
      }>;
    };

    return {
      gradingCriteria: Array.isArray(parsed.gradingCriteria)
        ? parsed.gradingCriteria
            .map((criterion) => ({
              number: criterion.number,
              criterion: criterion.criterion?.trim() || 'Assessment criterion',
              options: Array.isArray(criterion.options) ? criterion.options.filter(Boolean) : [],
            }))
            .filter((criterion) => criterion.criterion.length > 0)
        : [],
    };
  } catch {
    return { gradingCriteria: [] };
  }
}

function normalizeAssessmentPayload(value: unknown) {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const body = value as {
    passed?: unknown;
    score?: unknown;
    feedback?: unknown;
    criteria?: unknown;
  };

  const passed = body.passed === true;
  const score = typeof body.score === 'number' && Number.isFinite(body.score) ? Math.round(body.score) : null;
  const feedback = typeof body.feedback === 'string' ? body.feedback.trim() : '';
  const criteria = Array.isArray(body.criteria)
    ? body.criteria
        .map((entry, index) => {
          if (!entry || typeof entry !== 'object') {
            return null;
          }

          const item = entry as {
            criterionKey?: unknown;
            criterion?: unknown;
            selectedOption?: unknown;
            notes?: unknown;
            passed?: unknown;
            sortOrder?: unknown;
          };

          const criterion = typeof item.criterion === 'string' ? item.criterion.trim() : '';

          if (!criterion) {
            return null;
          }

          return {
            criterionKey:
              typeof item.criterionKey === 'string' && item.criterionKey.trim()
                ? item.criterionKey.trim()
                : `criterion-${index + 1}`,
            criterion,
            selectedOption: typeof item.selectedOption === 'string' ? item.selectedOption.trim() : '',
            notes: typeof item.notes === 'string' ? item.notes.trim() : '',
            passed: typeof item.passed === 'boolean' ? item.passed : null,
            sortOrder: typeof item.sortOrder === 'number' && Number.isFinite(item.sortOrder) ? item.sortOrder : index,
          };
        })
        .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    : [];

  if (score != null && (score < 0 || score > 100)) {
    return null;
  }

  return { passed, score, feedback, criteria };
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ courseId: string; studentId: string; badgeId: string }> }
) {
  try {
    const email = normalizeEmail(req.nextUrl.searchParams.get('email'));
    const { courseId: rawCourseId, studentId: rawStudentId, badgeId: rawBadgeId } = await context.params;
    const courseId = normalizeId(rawCourseId);
    const studentId = normalizeId(rawStudentId);
    const badgeId = normalizeId(rawBadgeId);

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    if (!courseId || !studentId || !badgeId) {
      return NextResponse.json({ error: 'Course id, student id, and badge id are required' }, { status: 400 });
    }

    if (!(await sessionMatchesEmail(email))) {
      return NextResponse.json({ error: 'Session does not match the requested user.' }, { status: 403 });
    }

    const user = await fetchUserByEmail(email);

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const course = await prisma.course.findFirst({
      where: {
        id: courseId,
        OR: [
          { createdById: user.id },
          {
            enrollments: {
              some: {
                studentId: user.id,
                role: { in: ['INSTRUCTOR', 'CHECKER'] },
              },
            },
          },
        ],
        enrollments: {
          some: {
            studentId,
          },
        },
      },
      select: {
        createdById: true,
        settings: true,
        lessons: {
          where: {
            badgeRequirements: {
              some: {
                badgeId,
              },
            },
          },
          orderBy: {
            sortOrder: 'asc',
          },
          select: {
            id: true,
            title: true,
            sortOrder: true,
            badgeRequirements: {
              where: {
                badgeId,
              },
              orderBy: {
                createdAt: 'asc',
              },
              select: {
                id: true,
                summary: true,
              },
            },
            checkpoints: {
              orderBy: {
                sortOrder: 'asc',
              },
              select: {
                id: true,
                title: true,
                label: true,
                sortOrder: true,
                questions: {
                  orderBy: {
                    sortOrder: 'asc',
                  },
                  select: {
                    id: true,
                    prompt: true,
                    options: true,
                  },
                },
                attempts: {
                  where: {
                    userId: studentId,
                  },
                  orderBy: {
                    createdAt: 'asc',
                  },
                  select: {
                    id: true,
                    createdAt: true,
                    completedAt: true,
                    isPassing: true,
                    responses: {
                      orderBy: {
                        createdAt: 'asc',
                      },
                      select: {
                        id: true,
                        questionId: true,
                        selectedIndex: true,
                        isCorrect: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
        enrollments: {
          where: {
            studentId: { in: Array.from(new Set([user.id, studentId])) },
          },
          select: {
            role: true,
            sections: {
              orderBy: {
                section: 'asc',
              },
              select: {
                section: true,
              },
            },
            student: {
              select: {
                id: true,
                badgeProgress: {
                  where: {
                    badgeId,
                  },
                  take: 1,
                  select: {
                    id: true,
                    status: true,
                    awardedAt: true,
                    score: true,
                    reassessmentLimit: true,
                    cooldownDays: true,
                    reassessmentRequired: true,
                    badge: {
                      select: {
                        id: true,
                        slug: true,
                        name: true,
                        description: true,
                        category: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!course || course.lessons.length === 0 || course.enrollments.length === 0) {
      return NextResponse.json(
        {
          error: 'Badge not found in this course or you do not have permission to view it.',
        },
        { status: 404 }
      );
    }

    const targetEnrollment = course.enrollments.find((enrollment) => enrollment.student.id === studentId);
    const viewerEnrollment = course.enrollments.find((enrollment) => enrollment.student.id === user.id);
    const isCourseCreator = course.createdById === user.id;
    const viewerRole = isCourseCreator ? 'INSTRUCTOR' : viewerEnrollment?.role;

    if (!targetEnrollment || !viewerRole || viewerRole === 'STUDENT') {
      return NextResponse.json(
        {
          error: 'Badge not found in this course or you do not have permission to view it.',
        },
        { status: 404 }
      );
    }

    if (viewerRole === 'CHECKER' && !course.settings?.allowCrossSectionView) {
      const viewerSections = new Set(viewerEnrollment?.sections.map((assignment) => assignment.section) ?? []);
      const memberSections = targetEnrollment.sections.map((assignment) => assignment.section);
      const canViewSection =
        memberSections.length === 0 || memberSections.some((section) => viewerSections.has(section));

      if (targetEnrollment.role !== 'STUDENT' || !canViewSection) {
        return NextResponse.json(
          {
            error: 'Badge not found in this course or you do not have permission to view it.',
          },
          { status: 404 }
        );
      }
    }

    const badgeProgress = targetEnrollment.student.badgeProgress[0];

    if (!badgeProgress) {
      return NextResponse.json({ error: 'Badge progress was not found for this student.' }, { status: 404 });
    }

    const assessmentCriteria = course.lessons.flatMap((lesson) =>
      lesson.badgeRequirements.flatMap((requirement) =>
        parseRequirementSummary(requirement.summary).gradingCriteria.map((criterion, index) => ({
          id: `${requirement.id}:${criterion.number ?? index + 1}`,
          criterionKey: `${requirement.id}:${criterion.number ?? index + 1}`,
          criterion: criterion.criterion,
          options: criterion.options,
          sortOrder: index,
        }))
      )
    );

    const assessmentAttempts = await prisma.assessmentAttempt.findMany({
      where: {
        courseId,
        studentId,
        badgeId,
      },
      orderBy: {
        createdAt: 'asc',
      },
      include: {
        assessor: {
          select: {
            name: true,
            email: true,
          },
        },
        responses: {
          orderBy: {
            sortOrder: 'asc',
          },
        },
      },
    });

    const flattenedCheckpoints = course.lessons.flatMap((lesson) =>
      lesson.checkpoints.map((checkpoint) => ({
        id: checkpoint.id,
        displayTitle: formatCheckpointLabel(checkpoint.label, checkpoint.sortOrder),
        lessonTitle: lesson.title,
        attempts: checkpoint.attempts,
      }))
    );

    const completedCheckpointIds = new Set(
      flattenedCheckpoints
        .filter((checkpoint) => checkpoint.attempts.some((attempt) => attempt.isPassing))
        .map((checkpoint) => checkpoint.id)
    );

    const totalCheckpoints = flattenedCheckpoints.length;
    const completedCheckpoints = completedCheckpointIds.size;
    const precheckComplete =
      totalCheckpoints === 0 ? badgeProgress.status !== 'LEARNING' : completedCheckpoints === totalCheckpoints;
    const latestPassingAssessment = [...assessmentAttempts].reverse().find((attempt) => attempt.passed);
    const latestAssessment = assessmentAttempts.at(-1) ?? null;
    const assessmentComplete =
      badgeProgress.status === 'COMPLETED' ||
      badgeProgress.status === 'READY_FOR_FINALIZATION' ||
      Boolean(latestPassingAssessment);
    const percentComplete =
      totalCheckpoints === 0
        ? precheckComplete
          ? 100
          : 0
        : Math.min(100, Math.max(0, Math.round((completedCheckpoints / totalCheckpoints) * 100)));

    const latestActivity = flattenedCheckpoints
      .flatMap((checkpoint) =>
        checkpoint.attempts.map((attempt) => ({
          checkpointTitle: checkpoint.displayTitle,
          createdAt: attempt.createdAt.toISOString(),
        }))
      )
      .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt))
      .at(-1);

    const nextCheckpoint = flattenedCheckpoints.find((checkpoint) => !completedCheckpointIds.has(checkpoint.id));
    const currentCheckpoint = precheckComplete
      ? null
      : latestActivity?.checkpointTitle || nextCheckpoint?.displayTitle || null;

    const checkpoints = course.lessons.flatMap((lesson) =>
      lesson.checkpoints.map((checkpoint) => ({
        id: checkpoint.id,
        title: formatCheckpointLabel(checkpoint.label, checkpoint.sortOrder),
        lessonTitle: lesson.title,
        questions: checkpoint.questions.map((question, questionIndex) => {
          const attempts = checkpoint.attempts
            .map((attempt) => {
              const response = attempt.responses.find((entry) => entry.questionId === question.id);

              if (!response) {
                return null;
              }

              return {
                id: `${attempt.id}-${question.id}`,
                label: '',
                answeredText: answerTextFromResponse(question.options, response.selectedIndex),
                isCorrect: response.isCorrect,
              };
            })
            .filter((entry): entry is { id: string; label: string; answeredText: string; isCorrect: boolean | null } =>
              Boolean(entry)
            )
            .map((entry, attemptIndex) => ({
              ...entry,
              label: `Attempt ${attemptIndex + 1}`,
            }));

          return {
            id: question.id,
            title: `Question ${questionIndex + 1}`,
            prompt: question.prompt,
            attempts,
          };
        }),
      }))
    );

    const gradingRows =
      latestAssessment?.responses.map((response) => ({
        id: response.id,
        title: response.criterion,
        outcome: [response.selectedOption, response.notes].filter(Boolean).join(' - ') || 'No assessor detail recorded',
        passed: response.passed ?? latestAssessment.passed,
      })) ??
      assessmentCriteria.map((criterion) => ({
        id: criterion.id,
        title: criterion.criterion,
        outcome: 'Not assessed yet',
        passed: false,
      }));

    return NextResponse.json(
      {
        badge: {
          id: badgeProgress.badge.id,
          slug: badgeProgress.badge.slug,
          name: badgeProgress.badge.name,
          description: badgeProgress.badge.description,
          category: badgeProgress.badge.category,
          status: badgeProgress.status,
          awardedAt: badgeProgress.awardedAt?.toISOString() ?? null,
          score: badgeProgress.score ?? null,
          reassessmentLimit: badgeProgress.reassessmentLimit ?? null,
          cooldownDays: badgeProgress.cooldownDays ?? null,
          reassessmentRequired: badgeProgress.reassessmentRequired ?? null,
          allowCooldownOverride: course.settings?.allowCooldownOverride ?? false,
        },
        progress: {
          percentComplete,
          precheckComplete,
          assessmentComplete,
          currentCheckpoint,
          totalCheckpoints,
          completedCheckpoints,
        },
        checkpoints,
        assessment: {
          completedOn:
            latestPassingAssessment?.completedAt?.toISOString() ?? badgeProgress.awardedAt?.toISOString() ?? null,
          attemptCount: assessmentAttempts.length,
          criteria: assessmentCriteria,
          gradingRows,
          attempts: assessmentAttempts.map((attempt, index) => ({
            id: attempt.id,
            label: `Attempt ${index + 1}`,
            score: attempt.score,
            completedAt: attempt.completedAt?.toISOString() ?? null,
            passed: attempt.passed,
            feedback: attempt.feedback,
            assessorName: attempt.assessor.name ?? attempt.assessor.email ?? null,
          })),
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('GET /api/courses/[courseId]/students/[studentId]/badges/[badgeId] failed:', error);

    return NextResponse.json({ error: 'Failed to fetch badge detail' }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ courseId: string; studentId: string; badgeId: string }> }
) {
  try {
    const email = normalizeEmail(req.nextUrl.searchParams.get('email'));
    const { courseId: rawCourseId, studentId: rawStudentId, badgeId: rawBadgeId } = await context.params;
    const courseId = normalizeId(rawCourseId);
    const studentId = normalizeId(rawStudentId);
    const badgeId = normalizeId(rawBadgeId);

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    if (!courseId || !studentId || !badgeId) {
      return NextResponse.json({ error: 'Course id, student id, and badge id are required' }, { status: 400 });
    }

    if (!(await sessionMatchesEmail(email))) {
      return NextResponse.json({ error: 'Session does not match the requested user.' }, { status: 403 });
    }

    const body = normalizeAssessmentPayload(await req.json().catch(() => null));

    if (!body) {
      return NextResponse.json({ error: 'Invalid assessment payload.' }, { status: 400 });
    }

    const user = await fetchUserByEmail(email);

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const course = await prisma.course.findFirst({
      where: {
        id: courseId,
        OR: [
          { createdById: user.id },
          {
            enrollments: {
              some: {
                studentId: user.id,
                role: { in: ['INSTRUCTOR', 'CHECKER'] },
              },
            },
          },
        ],
        lessons: {
          some: {
            badgeRequirements: {
              some: {
                badgeId,
              },
            },
          },
        },
        enrollments: {
          some: {
            studentId,
          },
        },
      },
      select: {
        createdById: true,
        settings: true,
        enrollments: {
          where: {
            studentId: { in: Array.from(new Set([user.id, studentId])) },
          },
          select: {
            role: true,
            sections: {
              orderBy: { section: 'asc' },
              select: { section: true },
            },
            student: {
              select: {
                id: true,
                badgeProgress: {
                  where: { badgeId },
                  take: 1,
                  select: {
                    id: true,
                    status: true,
                  },
                },
              },
            },
          },
        },
        lessons: {
          where: {
            badgeRequirements: {
              some: {
                badgeId,
              },
            },
          },
          select: {
            checkpoints: {
              select: {
                id: true,
                attempts: {
                  where: {
                    userId: studentId,
                    isPassing: true,
                  },
                  select: {
                    id: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!course || course.enrollments.length === 0) {
      return NextResponse.json(
        { error: 'Badge not found in this course or you do not have permission to assess it.' },
        { status: 404 }
      );
    }

    const targetEnrollment = course.enrollments.find((enrollment) => enrollment.student.id === studentId);
    const viewerEnrollment = course.enrollments.find((enrollment) => enrollment.student.id === user.id);
    const isCourseCreator = course.createdById === user.id;
    const viewerRole = isCourseCreator ? 'INSTRUCTOR' : viewerEnrollment?.role;

    if (!targetEnrollment || !viewerRole || viewerRole === 'STUDENT') {
      return NextResponse.json(
        { error: 'Badge not found in this course or you do not have permission to assess it.' },
        { status: 404 }
      );
    }

    if (viewerRole === 'CHECKER' && !course.settings?.allowCrossSectionView) {
      const viewerSections = new Set(viewerEnrollment?.sections.map((assignment) => assignment.section) ?? []);
      const memberSections = targetEnrollment.sections.map((assignment) => assignment.section);
      const canViewSection =
        memberSections.length === 0 || memberSections.some((section) => viewerSections.has(section));

      if (targetEnrollment.role !== 'STUDENT' || !canViewSection) {
        return NextResponse.json(
          { error: 'Badge not found in this course or you do not have permission to assess it.' },
          { status: 404 }
        );
      }
    }

    const badgeProgress = targetEnrollment.student.badgeProgress[0];

    if (!badgeProgress) {
      return NextResponse.json({ error: 'Badge progress was not found for this student.' }, { status: 404 });
    }

    const checkpoints = course.lessons.flatMap((lesson) => lesson.checkpoints);
    const precheckComplete =
      checkpoints.length === 0 ||
      checkpoints.every((checkpoint) => checkpoint.attempts.some((attempt) => Boolean(attempt.id)));

    if (!precheckComplete || badgeProgress.status === BadgeStatus.LEARNING) {
      return NextResponse.json({ error: 'Student has not completed the badge precheck.' }, { status: 409 });
    }

    const completedAt = new Date();
    const nextStatus = body.passed ? BadgeStatus.READY_FOR_FINALIZATION : BadgeStatus.LEARNING;

    const result = await prisma.$transaction(async (tx) => {
      const attempt = await tx.assessmentAttempt.create({
        data: {
          courseId,
          badgeId,
          studentId,
          assessorId: user.id,
          passed: body.passed,
          score: body.score,
          feedback: body.feedback || null,
          completedAt,
          responses: {
            create: body.criteria.map((criterion) => ({
              criterionKey: criterion.criterionKey,
              criterion: criterion.criterion,
              selectedOption: criterion.selectedOption || null,
              notes: criterion.notes || null,
              passed: criterion.passed,
              sortOrder: criterion.sortOrder,
            })),
          },
        },
      });

      const updatedBadge = await tx.studentBadge.update({
        where: {
          id: badgeProgress.id,
        },
        data: {
          status: nextStatus,
          score: body.score,
        },
      });

      return { attempt, status: updatedBadge.status };
    });

    return NextResponse.json(
      {
        attempt: {
          id: result.attempt.id,
          passed: result.attempt.passed,
          score: result.attempt.score,
          feedback: result.attempt.feedback,
          completedAt: result.attempt.completedAt?.toISOString() ?? null,
        },
        status: result.status,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('POST /api/courses/[courseId]/students/[studentId]/badges/[badgeId] failed:', error);

    return NextResponse.json({ error: 'Failed to record assessment' }, { status: 500 });
  }
}

type StudentBadgeConfigPayload = {
  reassessmentLimit?: unknown;
  cooldownDays?: unknown;
  reassessmentRequired?: unknown;
};

// Update per-student badge configuration (reassessment count, cooldown, and
// whether reassessment is mandatory). Instructor/checker only.
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ courseId: string; studentId: string; badgeId: string }> }
) {
  try {
    const email = normalizeEmail(req.nextUrl.searchParams.get('email'));
    const { courseId: rawCourseId, studentId: rawStudentId, badgeId: rawBadgeId } = await context.params;
    const courseId = normalizeId(rawCourseId);
    const studentId = normalizeId(rawStudentId);
    const badgeId = normalizeId(rawBadgeId);

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    if (!courseId || !studentId || !badgeId) {
      return NextResponse.json({ error: 'Course id, student id, and badge id are required' }, { status: 400 });
    }

    if (!(await sessionMatchesEmail(email))) {
      return NextResponse.json({ error: 'Session does not match the requested user.' }, { status: 403 });
    }

    const body = ((await req.json().catch(() => null)) ?? {}) as StudentBadgeConfigPayload;

    const data: { reassessmentLimit?: number; cooldownDays?: number; reassessmentRequired?: boolean } = {};
    if (typeof body.reassessmentLimit === 'number' && Number.isFinite(body.reassessmentLimit)) {
      data.reassessmentLimit = Math.max(0, Math.round(body.reassessmentLimit));
    }
    if (typeof body.cooldownDays === 'number' && Number.isFinite(body.cooldownDays)) {
      data.cooldownDays = Math.min(14, Math.max(0, Math.round(body.cooldownDays)));
    }
    if (typeof body.reassessmentRequired === 'boolean') {
      data.reassessmentRequired = body.reassessmentRequired;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'No configuration fields provided.' }, { status: 400 });
    }

    const user = await fetchUserByEmail(email);

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const course = await prisma.course.findFirst({
      where: {
        id: courseId,
        OR: [
          { createdById: user.id },
          {
            enrollments: {
              some: {
                studentId: user.id,
                role: { in: ['INSTRUCTOR', 'CHECKER'] },
              },
            },
          },
        ],
        enrollments: {
          some: {
            studentId,
          },
        },
      },
      select: {
        createdById: true,
        settings: true,
        enrollments: {
          where: {
            studentId: { in: Array.from(new Set([user.id, studentId])) },
          },
          select: {
            role: true,
            sections: {
              orderBy: { section: 'asc' },
              select: { section: true },
            },
            student: {
              select: {
                id: true,
                badgeProgress: {
                  where: { badgeId },
                  take: 1,
                  select: { id: true },
                },
              },
            },
          },
        },
      },
    });

    if (!course || course.enrollments.length === 0) {
      return NextResponse.json(
        { error: 'Badge not found in this course or you do not have permission to edit it.' },
        { status: 404 }
      );
    }

    const targetEnrollment = course.enrollments.find((enrollment) => enrollment.student.id === studentId);
    const viewerEnrollment = course.enrollments.find((enrollment) => enrollment.student.id === user.id);
    const isCourseCreator = course.createdById === user.id;
    const viewerRole = isCourseCreator ? 'INSTRUCTOR' : viewerEnrollment?.role;

    if (!targetEnrollment || !viewerRole || viewerRole === 'STUDENT') {
      return NextResponse.json(
        { error: 'Badge not found in this course or you do not have permission to edit it.' },
        { status: 404 }
      );
    }

    if (viewerRole === 'CHECKER' && !course.settings?.allowCrossSectionView) {
      const viewerSections = new Set(viewerEnrollment?.sections.map((assignment) => assignment.section) ?? []);
      const memberSections = targetEnrollment.sections.map((assignment) => assignment.section);
      const canViewSection =
        memberSections.length === 0 || memberSections.some((section) => viewerSections.has(section));

      if (targetEnrollment.role !== 'STUDENT' || !canViewSection) {
        return NextResponse.json(
          { error: 'Badge not found in this course or you do not have permission to edit it.' },
          { status: 404 }
        );
      }
    }

    // Cooldown overrides require the course to opt in.
    if (data.cooldownDays !== undefined && !course.settings?.allowCooldownOverride) {
      return NextResponse.json({ error: 'Cooldown overrides are disabled for this course.' }, { status: 403 });
    }

    const badgeProgress = targetEnrollment.student.badgeProgress[0];

    if (!badgeProgress) {
      return NextResponse.json({ error: 'Badge progress was not found for this student.' }, { status: 404 });
    }

    const updated = await prisma.studentBadge.update({
      where: { id: badgeProgress.id },
      data,
      select: {
        reassessmentLimit: true,
        cooldownDays: true,
        reassessmentRequired: true,
      },
    });

    return NextResponse.json({ config: updated }, { status: 200 });
  } catch (error) {
    console.error('PATCH /api/courses/[courseId]/students/[studentId]/badges/[badgeId] failed:', error);

    return NextResponse.json({ error: 'Failed to update badge configuration' }, { status: 500 });
  }
}
