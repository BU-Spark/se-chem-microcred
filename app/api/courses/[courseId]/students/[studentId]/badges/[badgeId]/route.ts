import { NextRequest, NextResponse } from 'next/server';
import { BadgeStatus, EnrollmentStatus } from '@prisma/client';
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

// Fetch the assessed badge's rubric (one goal, ordered subgoals). Shared by
// GET (display) and POST (validation + server-side scoring).
function fetchRubricGoal(badgeId: string) {
  return prisma.rubricGoal.findUnique({
    where: { badgeId },
    select: {
      id: true,
      name: true,
      totalPoints: true,
      passThreshold: true,
      subgoals: {
        orderBy: { sortOrder: 'asc' },
        select: { id: true, text: true, points: true, sortOrder: true },
      },
    },
  });
}

// The assessor submits a pass/fail per subgoal plus an optional override entry
// (the catch-all for anything the rubric doesn't cover). The score is computed
// server-side from the rubric, so the payload carries no score.
function normalizeAssessmentPayload(value: unknown) {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const body = value as {
    passed?: unknown;
    subgoals?: unknown;
    override?: unknown;
  };

  if (typeof body.passed !== 'boolean' || !Array.isArray(body.subgoals)) {
    return null;
  }

  const subgoals: Array<{ subgoalId: string; passed: boolean; feedback: string }> = [];
  for (const entry of body.subgoals) {
    if (!entry || typeof entry !== 'object') {
      return null;
    }

    const item = entry as { subgoalId?: unknown; passed?: unknown; feedback?: unknown };
    const subgoalId = typeof item.subgoalId === 'string' ? item.subgoalId.trim() : '';

    if (!subgoalId || typeof item.passed !== 'boolean') {
      return null;
    }

    subgoals.push({
      subgoalId,
      passed: item.passed,
      feedback: typeof item.feedback === 'string' ? item.feedback.trim() : '',
    });
  }

  const overrideFeedback =
    body.override &&
    typeof body.override === 'object' &&
    typeof (body.override as { feedback?: unknown }).feedback === 'string'
      ? ((body.override as { feedback: string }).feedback ?? '').trim()
      : '';

  return {
    passed: body.passed,
    subgoals,
    override: overrideFeedback ? { feedback: overrideFeedback } : null,
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
      latestAssessment?.responses && latestAssessment.responses.length > 0
        ? latestAssessment.responses.map((response) => ({
            id: response.id,
            title: response.isOverride ? 'Assessor override' : response.subgoalText,
            outcome:
              response.feedback ||
              (response.isOverride
                ? response.passed
                  ? 'Passed by assessor decision'
                  : 'Failed by assessor decision'
                : response.passed
                  ? `Passed (+${response.points} ${response.points === 1 ? 'pt' : 'pts'})`
                  : 'Not passed'),
            passed: response.passed,
          }))
        : (rubricGoal?.subgoals ?? []).map((subgoal) => ({
            id: subgoal.id,
            title: subgoal.text,
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
          rubric: rubricGoal
            ? {
                goalId: rubricGoal.id,
                goalName: rubricGoal.name,
                totalPoints: rubricGoal.totalPoints,
                passThreshold: rubricGoal.passThreshold,
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
    // rubric subgoals and the score derives from the points of passed ones.
    const rubricGoal = await fetchRubricGoal(badgeId);
    const rubricSubgoals = rubricGoal?.subgoals ?? [];
    const responseBySubgoalId = new Map(body.subgoals.map((entry) => [entry.subgoalId, entry]));

    if (
      body.subgoals.length !== rubricSubgoals.length ||
      rubricSubgoals.some((subgoal) => !responseBySubgoalId.has(subgoal.id))
    ) {
      return NextResponse.json({ error: 'Assessment must cover each rubric subgoal exactly once.' }, { status: 400 });
    }

    const pointsPossible = rubricSubgoals.reduce((sum, subgoal) => sum + subgoal.points, 0);
    const pointsEarned = rubricSubgoals.reduce(
      (sum, subgoal) => (responseBySubgoalId.get(subgoal.id)?.passed ? sum + subgoal.points : sum),
      0
    );
    const score = pointsPossible > 0 ? Math.round((pointsEarned / pointsPossible) * 100) : body.passed ? 100 : 0;

    // The threshold suggests the outcome; the assessor may flip it either way,
    // but only with an override entry justifying the call.
    const suggestedPassed = rubricGoal ? pointsEarned >= rubricGoal.passThreshold : body.passed;

    if (body.passed !== suggestedPassed && !body.override) {
      return NextResponse.json(
        { error: 'Overriding the score-suggested outcome requires override feedback.' },
        { status: 400 }
      );
    }

    const completedAt = new Date();
    const nextStatus = body.passed ? BadgeStatus.READY_FOR_FINALIZATION : BadgeStatus.LEARNING;

    type SubgoalResponseData = {
      subgoalId: string | null;
      subgoalText: string;
      points: number;
      passed: boolean;
      feedback: string | null;
      isOverride: boolean;
      sortOrder: number;
    };

    const subgoalResponses: SubgoalResponseData[] = rubricSubgoals.map((subgoal) => {
      const entry = responseBySubgoalId.get(subgoal.id)!;
      return {
        subgoalId: subgoal.id,
        // Snapshot text/points: rubric edits replace subgoal rows and SetNull
        // the FK, so past attempts must stay readable on their own.
        subgoalText: subgoal.text,
        points: subgoal.points,
        passed: entry.passed,
        feedback: entry.feedback || null,
        isOverride: false,
        sortOrder: subgoal.sortOrder,
      };
    });

    if (body.override || body.passed !== suggestedPassed) {
      subgoalResponses.push({
        subgoalId: null,
        subgoalText: 'Assessor override',
        points: 0,
        passed: body.passed,
        feedback: body.override?.feedback ?? null,
        isOverride: true,
        sortOrder: rubricSubgoals.length,
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      const attempt = await tx.assessmentAttempt.create({
        data: {
          courseId,
          badgeId,
          studentId,
          assessorId: user.id,
          passed: body.passed,
          score,
          pointsEarned: pointsPossible > 0 ? pointsEarned : null,
          pointsPossible: pointsPossible > 0 ? pointsPossible : null,
          // Mirror the override into the attempt-level feedback so attempt
          // history consumers keep working without reading response rows.
          feedback: body.override?.feedback ?? null,
          completedAt,
          responses: {
            create: subgoalResponses,
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
    const access = await authorizeBadgeRequest(req, context);
    if ('error' in access) {
      return access.error;
    }
    const { email, courseId, studentId, badgeId } = access;

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

    // Cooldown overrides require the course to opt in.
    if (data.cooldownDays !== undefined && !course.settings?.allowCooldownOverride) {
      return NextResponse.json({ error: 'Cooldown overrides are disabled for this course.' }, { status: 403 });
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
      },
    });

    return NextResponse.json({ config: updated }, { status: 200 });
  } catch (error) {
    console.error('PATCH /api/courses/[courseId]/students/[studentId]/badges/[badgeId] failed:', error);

    return NextResponse.json({ error: 'Failed to update badge configuration' }, { status: 500 });
  }
}
