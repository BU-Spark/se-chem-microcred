import { NextRequest, NextResponse } from 'next/server';
import { BadgeStatus, EnrollmentStatus } from '@prisma/client';
import { currentUser } from '@clerk/nextjs/server';

import { fetchUserByEmail } from '@/app/api/courses/lib/course-queries';
import { normalizeCheckpointQuestion, type NormalizedCheckpointQuestion } from '@/lib/checkpointQuestions';
import { resolveEffectiveBadgePolicy } from '@/lib/badgePolicy';
import prisma from '@/lib/prisma';
import { normalizeEmail } from '@/lib/text/email';

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

// Render a stored response against its (normalized) question. Multiple-choice
// answers map indices onto the normalized option texts; short answers read the
// persisted numericAnswer. Older responses predate the numericAnswer and
// selectedIndices columns, so fall back to selectedIndex / "No answer recorded".
function answerTextFromResponse(
  question: NormalizedCheckpointQuestion,
  response: { selectedIndex: number | null; selectedIndices: unknown; numericAnswer: number | null }
) {
  if (question.type === 'shortAnswer') {
    return response.numericAnswer != null ? String(response.numericAnswer) : 'No answer recorded';
  }

  const indices = Array.isArray(response.selectedIndices)
    ? response.selectedIndices.map((index) => Number(index)).filter((index) => Number.isInteger(index) && index >= 0)
    : response.selectedIndex != null
      ? [response.selectedIndex]
      : [];

  if (indices.length === 0) {
    return 'No answer recorded';
  }

  const options = Array.isArray(question.options) ? question.options : [];
  return indices.map((index) => (index < options.length ? String(options[index]) : `Option ${index + 1}`)).join(', ');
}

function formatCheckpointLabel(label: string | null | undefined, sortOrder: number) {
  const trimmed = label?.trim();
  const serialNumber = sortOrder + 1;

  if (!trimmed || /^checkpoint$/i.test(trimmed)) {
    return `Checkpoint ${serialNumber}`;
  }

  return trimmed;
}

// Fetch the assessed badge's rubric (one goal, ordered subgoals, each with its
// ordered tasks). Shared by GET (display) and POST (validation + scoring).
function fetchRubricGoal(badgeId: string) {
  return prisma.rubricGoal.findUnique({
    where: { badgeId },
    select: {
      id: true,
      name: true,
      instructions: true,
      subgoals: {
        orderBy: { sortOrder: 'asc' },
        select: {
          id: true,
          text: true,
          passThreshold: true,
          sortOrder: true,
          tasks: {
            orderBy: { sortOrder: 'asc' },
            select: { id: true, text: true, points: true, sortOrder: true },
          },
        },
      },
    },
  });
}

// The assessor submits a pass/fail per task. The badge outcome is computed
// server-side (per-subgoal thresholds, all subgoals must pass), so the payload
// carries no score. An optional override downgrades a passing result to "still
// learning" and, when present, must carry feedback (validated in POST).
function normalizeAssessmentPayload(value: unknown) {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const body = value as {
    tasks?: unknown;
    override?: unknown;
  };

  if (!Array.isArray(body.tasks)) {
    return null;
  }

  const tasks: Array<{ taskId: string; passed: boolean; feedback: string }> = [];
  for (const entry of body.tasks) {
    if (!entry || typeof entry !== 'object') {
      return null;
    }

    const item = entry as { taskId?: unknown; passed?: unknown; feedback?: unknown };
    const taskId = typeof item.taskId === 'string' ? item.taskId.trim() : '';

    if (!taskId || typeof item.passed !== 'boolean') {
      return null;
    }

    tasks.push({
      taskId,
      passed: item.passed,
      feedback: typeof item.feedback === 'string' ? item.feedback.trim() : '',
    });
  }

  // An override object (even with empty feedback) signals intent to downgrade;
  // POST rejects it when the feedback is missing.
  const hasOverride = Boolean(body.override) && typeof body.override === 'object';
  const overrideFeedback =
    hasOverride && typeof (body.override as { feedback?: unknown }).feedback === 'string'
      ? ((body.override as { feedback: string }).feedback ?? '').trim()
      : '';

  return {
    tasks,
    override: hasOverride ? { feedback: overrideFeedback } : null,
  };
}

type BadgeRouteAccess = { email: string; courseId: string; studentId: string; badgeId: string };

// Shared preamble for every handler on this route: validate the email + path
// params and confirm the query email matches the Clerk session. Returns the
// normalized identifiers, or a ready-to-return error response.
async function authorizeBadgeRequest(
  req: NextRequest,
  context: { params: Promise<{ courseId: string; studentId: string; badgeId: string }> }
): Promise<{ error: NextResponse } | BadgeRouteAccess> {
  const email = normalizeEmail(req.nextUrl.searchParams.get('email'));
  const { courseId: rawCourseId, studentId: rawStudentId, badgeId: rawBadgeId } = await context.params;
  const courseId = normalizeId(rawCourseId);
  const studentId = normalizeId(rawStudentId);
  const badgeId = normalizeId(rawBadgeId);

  if (!email) {
    return { error: NextResponse.json({ error: 'Email is required' }, { status: 400 }) };
  }

  if (!courseId || !studentId || !badgeId) {
    return { error: NextResponse.json({ error: 'Course id, student id, and badge id are required' }, { status: 400 }) };
  }

  if (!(await sessionMatchesEmail(email))) {
    return { error: NextResponse.json({ error: 'Session does not match the requested user.' }, { status: 403 }) };
  }

  return { email, courseId, studentId, badgeId };
}

type BadgeAccessAction = 'view' | 'assess' | 'edit';

const BADGE_ACCESS_DENIED: Record<BadgeAccessAction, string> = {
  view: 'Badge not found in this course or you do not have permission to view it.',
  assess: 'Badge not found in this course or you do not have permission to assess it.',
  edit: 'Badge not found in this course or you do not have permission to edit it.',
};

type AccessCourse<P> = {
  createdById: string | null;
  settings: { allowCrossSectionView: boolean } | null;
  enrollments: Array<{
    role: string;
    status: string;
    sections: Array<{ section: string }>;
    student: { id: string; badgeProgress: P[] };
  }>;
};

// Shared authorization for viewing/assessing/editing a student's badge: the
// viewer must be the course creator or an enrolled instructor/checker (never a
// student), and a checker is confined to their own sections unless the course
// allows cross-section viewing. The 404 message varies only by action verb.
function resolveBadgeAccess<P>(
  course: AccessCourse<P>,
  userId: string,
  studentId: string,
  action: BadgeAccessAction
):
  | { error: NextResponse }
  | { targetEnrollment: AccessCourse<P>['enrollments'][number]; badgeProgress: P | undefined } {
  const denied = { error: NextResponse.json({ error: BADGE_ACCESS_DENIED[action] }, { status: 404 }) };
  const targetEnrollment = course.enrollments.find((enrollment) => enrollment.student.id === studentId);
  const viewerEnrollment = course.enrollments.find((enrollment) => enrollment.student.id === userId);
  const isCourseCreator = course.createdById === userId;
  const viewerRole =
    isCourseCreator || viewerEnrollment?.status === EnrollmentStatus.ACTIVE ? viewerEnrollment?.role : undefined;
  const effectiveViewerRole = isCourseCreator ? 'INSTRUCTOR' : viewerRole;

  if (!targetEnrollment || !effectiveViewerRole || effectiveViewerRole === 'STUDENT') {
    return denied;
  }

  if (effectiveViewerRole === 'CHECKER' && !course.settings?.allowCrossSectionView) {
    const viewerSections = new Set(viewerEnrollment?.sections.map((assignment) => assignment.section) ?? []);
    const memberSections = targetEnrollment.sections.map((assignment) => assignment.section);
    const canViewSection = memberSections.length === 0 || memberSections.some((section) => viewerSections.has(section));

    if (targetEnrollment.role !== 'STUDENT' || !canViewSection) {
      return denied;
    }
  }

  return { targetEnrollment, badgeProgress: targetEnrollment.student.badgeProgress[0] };
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ courseId: string; studentId: string; badgeId: string }> }
) {
  try {
    const access = await authorizeBadgeRequest(req, context);
    if ('error' in access) {
      return access.error;
    }
    const { email, courseId, studentId, badgeId } = access;

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
                status: EnrollmentStatus.ACTIVE,
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
                    correctIndex: true,
                  },
                },
                attempts: {
                  // Instructor view: include ALL runs (archived failed runs too),
                  // grouped by lessonAttemptId into "Attempt N" further below.
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
                    lessonAttemptId: true,
                    responses: {
                      orderBy: {
                        createdAt: 'asc',
                      },
                      select: {
                        id: true,
                        questionId: true,
                        selectedIndex: true,
                        selectedIndices: true,
                        numericAnswer: true,
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
            status: true,
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
                    qevPassedAt: true,
                    cooldownUntil: true,
                    feedbackReviewedAt: true,
                    badge: {
                      select: {
                        id: true,
                        slug: true,
                        name: true,
                        description: true,
                        // Badge-level policy defaults; the effective policy for this
                        // student resolves overrides against them (lib/badgePolicy).
                        reassessmentLimit: true,
                        cooldownDays: true,
                        reassessmentRequired: true,
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

    const gate = resolveBadgeAccess(course, user.id, studentId, 'view');
    if ('error' in gate) {
      return gate.error;
    }

    const badgeProgress = gate.badgeProgress;

    if (!badgeProgress) {
      return NextResponse.json({ error: 'Badge progress was not found for this student.' }, { status: 404 });
    }

    const rubricGoal = await fetchRubricGoal(badgeId);

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
    // Readiness is owned by the badge status, which the grade pipeline flips to
    // READY_FOR_ASSESSMENT once the student clears the lesson's passingPercent.
    // Don't re-derive a stricter "every checkpoint passing" (== 100%) rule here —
    // completedCheckpoints/totalCheckpoints stay for the informational display only.
    const precheckComplete = badgeProgress.status !== 'LEARNING';
    const latestPassingAssessment = [...assessmentAttempts].reverse().find((attempt) => attempt.passed);
    const latestAssessment = assessmentAttempts.at(-1) ?? null;
    // IN_REVIEW covers both the pass-pending-acknowledge and fail-pending-acknowledge
    // states; a passing attempt (or COMPLETED) is what marks the assessment done.
    const assessmentComplete =
      badgeProgress.status === 'COMPLETED' ||
      (badgeProgress.status === 'IN_REVIEW' && Boolean(latestPassingAssessment)) ||
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
          const normalizedQuestion = normalizeCheckpointQuestion(question);
          const attempts = checkpoint.attempts
            .map((attempt) => {
              const response = attempt.responses.find((entry) => entry.questionId === question.id);

              if (!response) {
                return null;
              }

              return {
                id: `${attempt.id}-${question.id}`,
                label: '',
                answeredText: answerTextFromResponse(normalizedQuestion, response),
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

    // Precheck (QEV) attempt history, grouped run-by-run like the in-person
    // assessment attempts. Each graded watch-through is a LessonAttempt; a trailing
    // "in progress" run collects any answers not yet graded (lessonAttemptId null).
    const lessonAttemptRecords = await prisma.lessonAttempt.findMany({
      where: { studentId, lessonId: { in: course.lessons.map((lesson) => lesson.id) } },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        lessonId: true,
        passed: true,
        gradePercent: true,
        correctAnswers: true,
        totalQuestions: true,
        completedAt: true,
      },
    });

    type QevRunView = {
      id: string;
      label: string;
      lessonTitle: string;
      passed: boolean | null;
      gradePercent: number | null;
      correctAnswers: number | null;
      totalQuestions: number | null;
      completedAt: string | null;
      inProgress: boolean;
      checkpoints: Array<{
        id: string;
        title: string;
        timeCompleted: string | null;
        questions: Array<{
          id: string;
          title: string;
          prompt: string | null;
          answers: Array<{ answeredText: string; isCorrect: boolean | null }>;
        }>;
      }>;
    };

    const qevAttempts: QevRunView[] = course.lessons.flatMap((lesson) => {
      const buildRunCheckpoints = (runId: string | null) =>
        lesson.checkpoints
          .map((checkpoint) => {
            const runAttempts = checkpoint.attempts.filter((attempt) => attempt.lessonAttemptId === runId);
            if (runAttempts.length === 0) return null;
            const latestCompletedAt = runAttempts
              .map((attempt) => attempt.completedAt)
              .filter((value): value is Date => Boolean(value))
              .sort((a, b) => a.getTime() - b.getTime())
              .at(-1);
            const questions = checkpoint.questions
              .map((question, questionIndex) => {
                const normalizedQuestion = normalizeCheckpointQuestion(question);
                const answers = runAttempts
                  .map((attempt) => {
                    const response = attempt.responses.find((entry) => entry.questionId === question.id);
                    if (!response) return null;
                    return {
                      answeredText: answerTextFromResponse(normalizedQuestion, response),
                      isCorrect: response.isCorrect,
                    };
                  })
                  .filter((entry): entry is { answeredText: string; isCorrect: boolean | null } => Boolean(entry));
                return { id: question.id, title: `Question ${questionIndex + 1}`, prompt: question.prompt, answers };
              })
              .filter((question) => question.answers.length > 0);
            return {
              id: checkpoint.id,
              title: formatCheckpointLabel(checkpoint.label, checkpoint.sortOrder),
              timeCompleted: latestCompletedAt?.toISOString() ?? null,
              questions,
            };
          })
          .filter((checkpoint): checkpoint is NonNullable<typeof checkpoint> => Boolean(checkpoint));

      const runs = lessonAttemptRecords.filter((record) => record.lessonId === lesson.id);
      const views: QevRunView[] = runs.map((run, index) => ({
        id: run.id,
        label: `Attempt ${index + 1}`,
        lessonTitle: lesson.title,
        passed: run.passed,
        gradePercent: Math.round(run.gradePercent),
        correctAnswers: run.correctAnswers,
        totalQuestions: run.totalQuestions,
        completedAt: run.completedAt.toISOString(),
        inProgress: false,
        checkpoints: buildRunCheckpoints(run.id),
      }));

      const currentCheckpoints = buildRunCheckpoints(null);
      if (currentCheckpoints.length > 0) {
        views.push({
          id: `${lesson.id}-current`,
          label: `Attempt ${runs.length + 1}`,
          lessonTitle: lesson.title,
          passed: null,
          gradePercent: null,
          correctAnswers: null,
          totalQuestions: null,
          completedAt: null,
          inProgress: true,
          checkpoints: currentCheckpoints,
        });
      }

      return views;
    });

    const gradingRows =
      latestAssessment?.responses && latestAssessment.responses.length > 0
        ? latestAssessment.responses.map((response) => ({
            id: response.id,
            title: response.isOverride ? 'Assessor override' : `${response.subgoalText} › ${response.taskText}`,
            outcome:
              response.feedback ||
              (response.isOverride
                ? 'Overridden to still learning'
                : response.passed
                  ? `Passed (+${response.points} ${response.points === 1 ? 'pt' : 'pts'})`
                  : 'Not passed'),
            passed: response.passed,
          }))
        : (rubricGoal?.subgoals ?? []).flatMap((subgoal) =>
            subgoal.tasks.map((task) => ({
              id: task.id,
              title: `${subgoal.text} › ${task.text}`,
              outcome: 'Not assessed yet',
              passed: false,
            }))
          );

    return NextResponse.json(
      {
        badge: {
          id: badgeProgress.badge.id,
          slug: badgeProgress.badge.slug,
          name: badgeProgress.badge.name,
          description: badgeProgress.badge.description,
          status: badgeProgress.status,
          awardedAt: badgeProgress.awardedAt?.toISOString() ?? null,
          score: badgeProgress.score ?? null,
          qevPassedAt: badgeProgress.qevPassedAt?.toISOString() ?? null,
          cooldownUntil: badgeProgress.cooldownUntil?.toISOString() ?? null,
          feedbackReviewedAt: badgeProgress.feedbackReviewedAt?.toISOString() ?? null,
          // Raw per-student overrides (null = inherit) for the config editor …
          reassessmentLimit: badgeProgress.reassessmentLimit ?? null,
          cooldownDays: badgeProgress.cooldownDays ?? null,
          reassessmentRequired: badgeProgress.reassessmentRequired ?? null,
          // … and the resolved policy that actually applies to this student.
          effectivePolicy: resolveEffectiveBadgePolicy(badgeProgress, badgeProgress.badge),
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
        // Precheck answer history grouped by watch-through (run) for the viewer.
        qevAttempts,
        assessment: {
          completedOn:
            latestPassingAssessment?.completedAt?.toISOString() ?? badgeProgress.awardedAt?.toISOString() ?? null,
          attemptCount: assessmentAttempts.length,
          rubric: rubricGoal
            ? {
                goalId: rubricGoal.id,
                goalName: rubricGoal.name,
                instructions: rubricGoal.instructions,
                subgoals: rubricGoal.subgoals,
              }
            : null,
          gradingRows,
          attempts: assessmentAttempts.map((attempt, index) => ({
            id: attempt.id,
            label: `Attempt ${index + 1}`,
            score: attempt.score,
            pointsEarned: attempt.pointsEarned,
            pointsPossible: attempt.pointsPossible,
            completedAt: attempt.completedAt?.toISOString() ?? null,
            passed: attempt.passed,
            feedback: attempt.feedback,
            assessorName: attempt.assessor.name ?? attempt.assessor.email ?? null,
            // Per-attempt rubric breakdown for the "Assessment history" dropdown.
            responses: attempt.responses.map((response) => ({
              id: response.id,
              title: response.isOverride ? 'Assessor override' : `${response.subgoalText} › ${response.taskText}`,
              subgoalText: response.subgoalText,
              taskText: response.taskText,
              points: response.points,
              passed: response.passed,
              feedback: response.feedback,
              isOverride: response.isOverride,
            })),
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
    const access = await authorizeBadgeRequest(req, context);
    if ('error' in access) {
      return access.error;
    }
    const { email, courseId, studentId, badgeId } = access;

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
                status: EnrollmentStatus.ACTIVE,
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
            status: true,
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
      },
    });

    if (!course || course.enrollments.length === 0) {
      return NextResponse.json(
        { error: 'Badge not found in this course or you do not have permission to assess it.' },
        { status: 404 }
      );
    }

    const gate = resolveBadgeAccess(course, user.id, studentId, 'assess');
    if ('error' in gate) {
      return gate.error;
    }

    const badgeProgress = gate.badgeProgress;

    if (!badgeProgress) {
      return NextResponse.json({ error: 'Badge progress was not found for this student.' }, { status: 404 });
    }

    // Precheck is owned by the badge status: the grade pipeline flips it out of
    // LEARNING once the student clears the lesson's passingPercent. A still-LEARNING
    // student hasn't passed the lesson yet.
    if (badgeProgress.status === BadgeStatus.LEARNING) {
      return NextResponse.json({ error: 'Student has not completed the badge precheck.' }, { status: 409 });
    }

    if (badgeProgress.status !== BadgeStatus.READY_FOR_ASSESSMENT) {
      return NextResponse.json({ error: 'This badge has already been assessed.' }, { status: 409 });
    }

    // The server owns scoring: the payload is matched against the badge's
    // rubric tasks and the outcome derives from per-subgoal thresholds.
    const rubricGoal = await fetchRubricGoal(badgeId);
    const rubricSubgoals = rubricGoal?.subgoals ?? [];
    const rubricTasks = rubricSubgoals.flatMap((subgoal) =>
      subgoal.tasks.map((task) => ({ ...task, subgoalText: subgoal.text }))
    );

    // Guard against legacy/imported badges or blank rubrics. Without tasks,
    // validation would trivially pass (empty set == empty set), letting the
    // badge record a perfect score. Require at least one task to assess.
    if (!rubricGoal || rubricTasks.length === 0) {
      return NextResponse.json(
        { error: 'This badge has no rubric or tasks defined and cannot be assessed.' },
        { status: 400 }
      );
    }

    const responseByTaskId = new Map(body.tasks.map((entry) => [entry.taskId, entry]));

    if (body.tasks.length !== rubricTasks.length || rubricTasks.some((task) => !responseByTaskId.has(task.id))) {
      return NextResponse.json({ error: 'Assessment must cover each rubric task exactly once.' }, { status: 400 });
    }

    // A subgoal passes when its passed tasks' weights meet its threshold; the
    // badge passes only when every subgoal passes.
    const computedPassed = rubricSubgoals.every((subgoal) => {
      const earned = subgoal.tasks.reduce(
        (sum, task) => (responseByTaskId.get(task.id)?.passed ? sum + task.points : sum),
        0
      );
      return earned >= subgoal.passThreshold;
    });

    // The override is a one-way downgrade of a passing result to "still
    // learning" and requires justification (issue #119).
    if (body.override && !computedPassed) {
      return NextResponse.json(
        { error: 'Only a passing assessment can be overridden to still learning.' },
        { status: 400 }
      );
    }

    if (body.override && !body.override.feedback) {
      return NextResponse.json(
        { error: 'Overriding a passing assessment to still learning requires feedback.' },
        { status: 400 }
      );
    }

    const passed = computedPassed && !body.override;

    const pointsPossible = rubricTasks.reduce((sum, task) => sum + task.points, 0);
    const pointsEarned = rubricTasks.reduce(
      (sum, task) => (responseByTaskId.get(task.id)?.passed ? sum + task.points : sum),
      0
    );
    const score = pointsPossible > 0 ? Math.round((pointsEarned / pointsPossible) * 100) : passed ? 100 : 0;

    const completedAt = new Date();
    // Submitting an attempt always lands the badge in IN_REVIEW — pass or fail. The
    // pass/fail outcome is derived from the latest attempt, not stored in the enum,
    // and the badge only leaves IN_REVIEW once the student acknowledges feedback
    // (pass-path rate → COMPLETED, fail-path acknowledge → READY_FOR_ASSESSMENT/LOCKED).
    const nextStatus = BadgeStatus.IN_REVIEW;

    type TaskResponseData = {
      taskId: string | null;
      subgoalText: string;
      taskText: string;
      points: number;
      passed: boolean;
      feedback: string | null;
      isOverride: boolean;
      sortOrder: number;
    };

    const taskResponses: TaskResponseData[] = rubricTasks.map((task, index) => {
      const entry = responseByTaskId.get(task.id)!;
      return {
        taskId: task.id,
        // Snapshot text/points: rubric edits replace task rows and SetNull the
        // FK, so past attempts must stay readable on their own.
        subgoalText: task.subgoalText,
        taskText: task.text,
        points: task.points,
        passed: entry.passed,
        feedback: entry.feedback || null,
        isOverride: false,
        sortOrder: index,
      };
    });

    if (body.override) {
      taskResponses.push({
        taskId: null,
        subgoalText: 'Assessor override',
        taskText: 'Assessor override',
        points: 0,
        passed: false,
        feedback: body.override.feedback,
        isOverride: true,
        sortOrder: rubricTasks.length,
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      const attempt = await tx.assessmentAttempt.create({
        data: {
          courseId,
          badgeId,
          studentId,
          assessorId: user.id,
          passed,
          score,
          pointsEarned: pointsPossible > 0 ? pointsEarned : null,
          pointsPossible: pointsPossible > 0 ? pointsPossible : null,
          // Mirror the override into the attempt-level feedback so attempt
          // history consumers keep working without reading response rows.
          feedback: body.override?.feedback ?? null,
          completedAt,
          responses: {
            create: taskResponses,
          },
        },
      });

      const updatedBadge = await tx.studentBadge.update({
        where: {
          id: badgeProgress.id,
        },
        data: {
          status: nextStatus,
          score,
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
          pointsEarned: result.attempt.pointsEarned,
          pointsPossible: result.attempt.pointsPossible,
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
  reassessmentRequired?: unknown;
  // One-click assessor action: clear the cooldown so a student who failed the
  // in-person assessment can re-assess immediately. The cooldown *length* is
  // authored on the badge, not set per student here.
  overrideCooldown?: unknown;
};

// Update per-student badge configuration (reassessment count, whether reassessment
// is mandatory) and/or override an active cooldown. Instructor/checker only.
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ courseId: string; studentId: string; badgeId: string }> }
) {
  try {
    const access = await authorizeBadgeRequest(req, context);
    if ('error' in access) {
      return access.error;
    }
    const { email, courseId, studentId, badgeId } = access;

    const body = ((await req.json().catch(() => null)) ?? {}) as StudentBadgeConfigPayload;

    const data: { reassessmentLimit?: number; reassessmentRequired?: boolean; cooldownUntil?: null } = {};
    if (typeof body.reassessmentLimit === 'number' && Number.isFinite(body.reassessmentLimit)) {
      data.reassessmentLimit = Math.max(0, Math.round(body.reassessmentLimit));
    }
    if (typeof body.reassessmentRequired === 'boolean') {
      data.reassessmentRequired = body.reassessmentRequired;
    }
    const wantsCooldownOverride = body.overrideCooldown === true;

    if (Object.keys(data).length === 0 && !wantsCooldownOverride) {
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
                status: EnrollmentStatus.ACTIVE,
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
            status: true,
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

    const gate = resolveBadgeAccess(course, user.id, studentId, 'edit');
    if ('error' in gate) {
      return gate.error;
    }

    // Overriding the cooldown requires the course to opt in. When allowed, clearing
    // cooldownUntil lets the student re-assess immediately (the QR/access-code gates
    // read this same timestamp).
    if (wantsCooldownOverride) {
      if (!course.settings?.allowCooldownOverride) {
        return NextResponse.json({ error: 'Cooldown overrides are disabled for this course.' }, { status: 403 });
      }
      data.cooldownUntil = null;
    }

    const badgeProgress = gate.badgeProgress;

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
        cooldownUntil: true,
      },
    });

    return NextResponse.json(
      { config: { ...updated, cooldownUntil: updated.cooldownUntil?.toISOString() ?? null } },
      { status: 200 }
    );
  } catch (error) {
    console.error('PATCH /api/courses/[courseId]/students/[studentId]/badges/[badgeId] failed:', error);

    return NextResponse.json({ error: 'Failed to update badge configuration' }, { status: 500 });
  }
}
