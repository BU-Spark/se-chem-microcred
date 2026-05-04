import { NextRequest, NextResponse } from 'next/server';

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

    const user = await fetchUserByEmail(email);

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const course = await prisma.course.findFirst({
      where: {
        id: courseId,
        createdById: user.id,
        enrollments: {
          some: {
            studentId,
          },
        },
      },
      select: {
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
            studentId,
          },
          take: 1,
          select: {
            student: {
              select: {
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

    const badgeProgress = course.enrollments[0]?.student.badgeProgress[0];

    if (!badgeProgress) {
      return NextResponse.json({ error: 'Badge progress was not found for this student.' }, { status: 404 });
    }

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
    const assessmentComplete =
      badgeProgress.status === 'COMPLETED' || badgeProgress.status === 'READY_FOR_FINALIZATION';
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

    const gradingRows = course.lessons.flatMap((lesson) =>
      lesson.badgeRequirements.map((requirement) => ({
        id: requirement.id,
        title: requirement.summary?.trim() || lesson.title,
        outcome:
          badgeProgress.score != null ? `Assessment score recorded: ${badgeProgress.score}%` : 'Requirement completed',
        passed: true,
      }))
    );

    const assessmentAttemptCount =
      badgeProgress.status === 'COMPLETED' || badgeProgress.status === 'READY_FOR_FINALIZATION' ? 1 : 0;

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
          completedOn: badgeProgress.awardedAt?.toISOString() ?? null,
          attemptCount: assessmentAttemptCount,
          gradingRows:
            gradingRows.length > 0
              ? gradingRows
              : [
                  {
                    id: `${badgeProgress.id}-record`,
                    title: 'Badge assessment',
                    outcome:
                      badgeProgress.score != null
                        ? `Assessment score recorded: ${badgeProgress.score}%`
                        : 'Assessment completion was recorded for this badge.',
                    passed: true,
                  },
                ],
          attempts:
            assessmentAttemptCount > 0
              ? [
                  {
                    id: badgeProgress.id,
                    label: 'Attempt 1',
                    score: badgeProgress.score ?? null,
                    completedAt: badgeProgress.awardedAt?.toISOString() ?? null,
                  },
                ]
              : [],
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('GET /api/courses/[courseId]/students/[studentId]/badges/[badgeId] failed:', error);

    return NextResponse.json({ error: 'Failed to fetch badge detail' }, { status: 500 });
  }
}
