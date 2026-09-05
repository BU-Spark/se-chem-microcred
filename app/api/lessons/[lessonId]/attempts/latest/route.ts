import { NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
import prisma from '../../../../../../lib/prisma';
import { normalizeCheckpointQuestion } from '../../../../../../lib/checkpointQuestions';
import { answerHtmlFromResponse } from '../../../../../../lib/checkpointAnswers';
import { sanitizeQuestionRichText } from '../../../../../../lib/question-rich-text';

type RouteContext = {
  params: Promise<{
    lessonId: string;
  }>;
};

type ReviewQuestion = {
  id: string;
  promptHtml: string;
  type: 'multipleChoice' | 'shortAnswer';
  answerHtml: string[];
  isCorrect: boolean | null;
};

type ReviewCheckpoint = {
  id: string;
  title: string;
  questions: ReviewQuestion[];
};

function formatCheckpointLabel(label: string | null | undefined, sortOrder: number) {
  const trimmed = label?.trim();
  if (!trimmed || /^checkpoint$/i.test(trimmed)) {
    return `Checkpoint ${sortOrder + 1}`;
  }
  return trimmed;
}

function roundPercent(value: number) {
  return Math.round(value * 100) / 100;
}

export async function GET(_request: Request, context: RouteContext) {
  const { lessonId } = await context.params;

  if (!lessonId) {
    return NextResponse.json({ error: 'Missing lesson id.' }, { status: 400 });
  }

  const clerkUser = await currentUser();
  if (!clerkUser || !clerkUser.emailAddresses?.[0]) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const email = clerkUser.emailAddresses[0].emailAddress.toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    return NextResponse.json({ error: 'Student not found.' }, { status: 404 });
  }

  // Only the latest run. Scoping the answers by lessonAttemptId (rather than the
  // usual archivedAt: null) is what makes a *failed* run reviewable: sealing a
  // failed run archives its responses so the retry starts from a fresh slate.
  const [lesson, attempt] = await Promise.all([
    prisma.lesson.findUnique({ where: { id: lessonId }, select: { passingPercent: true } }),
    prisma.lessonAttempt.findFirst({
      where: { studentId: user.id, lessonId },
      orderBy: [{ completedAt: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        passed: true,
        gradePercent: true,
        correctAnswers: true,
        totalQuestions: true,
        completedAt: true,
        checkpointAttempts: {
          orderBy: { completedAt: 'asc' },
          select: {
            completedAt: true,
            responses: {
              select: {
                questionId: true,
                selectedIndex: true,
                selectedIndices: true,
                numericAnswer: true,
                isCorrect: true,
              },
            },
            checkpoint: {
              select: {
                id: true,
                label: true,
                sortOrder: true,
                questions: {
                  orderBy: { sortOrder: 'asc' },
                  select: { id: true, prompt: true, options: true, correctIndex: true, points: true },
                },
              },
            },
          },
        },
      },
    }),
  ]);

  if (!attempt) {
    return NextResponse.json({ error: 'No finished attempt to review yet.' }, { status: 404 });
  }

  // One checkpoint can hold several attempts within a single run, so collapse to
  // the student's last answer per question. checkpointAttempts is ordered oldest
  // first, so a later write simply overwrites an earlier one.
  const checkpointsById = new Map<string, ReviewCheckpoint & { sortOrder: number }>();
  const latestByQuestion = new Map<string, { answerHtml: string[]; isCorrect: boolean | null }>();

  for (const checkpointAttempt of attempt.checkpointAttempts) {
    const { checkpoint } = checkpointAttempt;

    if (!checkpointsById.has(checkpoint.id)) {
      checkpointsById.set(checkpoint.id, {
        id: checkpoint.id,
        title: formatCheckpointLabel(checkpoint.label, checkpoint.sortOrder),
        sortOrder: checkpoint.sortOrder,
        questions: checkpoint.questions.map((question) => ({
          id: question.id,
          promptHtml: sanitizeQuestionRichText(question.prompt),
          type: normalizeCheckpointQuestion(question).type,
          answerHtml: [],
          isCorrect: null,
        })),
      });
    }

    for (const response of checkpointAttempt.responses) {
      const question = checkpoint.questions.find((entry) => entry.id === response.questionId);
      if (!question) {
        continue;
      }
      latestByQuestion.set(question.id, {
        answerHtml: answerHtmlFromResponse(normalizeCheckpointQuestion(question), response),
        isCorrect: response.isCorrect,
      });
    }
  }

  const checkpoints = [...checkpointsById.values()]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((checkpoint) => ({
      id: checkpoint.id,
      title: checkpoint.title,
      questions: checkpoint.questions
        .map((question) => ({ ...question, ...(latestByQuestion.get(question.id) ?? {}) }))
        .filter((question) => latestByQuestion.has(question.id)),
    }))
    .filter((checkpoint) => checkpoint.questions.length > 0);

  return NextResponse.json({
    attemptId: attempt.id,
    passed: attempt.passed,
    gradePercent: roundPercent(attempt.gradePercent),
    passingPercent: lesson?.passingPercent ?? 0,
    correctAnswers: attempt.correctAnswers,
    totalQuestions: attempt.totalQuestions,
    completedAt: attempt.completedAt.toISOString(),
    checkpoints,
  });
}
