import { NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
import prisma from '../../../../../lib/prisma';
import {
  isAnswerWithinAcceptedRange,
  isAnswerWithinTolerance,
  normalizeCheckpointQuestion,
  parseNumericAnswer,
  type NormalizedCheckpointQuestion,
} from '../../../../../lib/checkpointQuestions';

interface AttemptRequestBody {
  email?: string;
  answers?: Array<{
    questionId: string;
    selectedIndex: number | null;
    numericAnswer?: number | string | null;
  }>;
}

type RouteContext = {
  params: Promise<{
    checkpointId: string;
  }>;
};

function evaluateAttempt(answers: AttemptRequestBody['answers'], questions: NormalizedCheckpointQuestion[]) {
  return questions.map((question) => {
    const answer = answers?.find((item) => item.questionId === question.id);
    const selectedIndex = typeof answer?.selectedIndex === 'number' ? answer.selectedIndex : null;
    const numericAnswer = parseNumericAnswer(answer?.numericAnswer);

    const isCorrect =
      question.type === 'shortAnswer'
        ? numericAnswer != null &&
          (isAnswerWithinAcceptedRange(question.acceptedRange, numericAnswer) ||
            (question.expectedAnswer != null &&
              isAnswerWithinTolerance(question.expectedAnswer, numericAnswer, question.tolerancePercent)))
        : selectedIndex !== null && question.correctIndices.includes(selectedIndex);
    return {
      questionId: question.id,
      prompt: question.prompt,
      options: question.options,
      type: question.type,
      selectedIndex: question.type === 'multipleChoice' ? selectedIndex : null,
      numericAnswer: question.type === 'shortAnswer' ? numericAnswer : null,
      correctIndex: question.correctIndex ?? null,
      expectedAnswer: question.expectedAnswer ?? null,
      tolerancePercent: question.tolerancePercent,
      acceptedRange: question.acceptedRange,
      isCorrect,
    };
  });
}

export async function POST(request: Request, context: RouteContext) {
  const { checkpointId } = await context.params;

  if (!checkpointId) {
    return NextResponse.json({ error: 'Missing checkpoint id.' }, { status: 400 });
  }

  const clerkUser = await currentUser();
  if (!clerkUser || !clerkUser.emailAddresses?.[0]) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const email = clerkUser.emailAddresses[0].emailAddress.toLowerCase();

  let payload: AttemptRequestBody;

  try {
    payload = (await request.json()) as AttemptRequestBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
  }

  if (!payload.answers || !Array.isArray(payload.answers)) {
    return NextResponse.json({ error: 'Request must include answers.' }, { status: 400 });
  }
  const [user, checkpoint] = await Promise.all([
    prisma.user.findUnique({ where: { email } }),
    prisma.lessonCheckpoint.findUnique({
      where: { id: checkpointId },
      include: {
        questions: {
          orderBy: { sortOrder: 'asc' },
        },
        lesson: true,
      },
    }),
  ]);

  if (!user) {
    return NextResponse.json({ error: 'Student not found.' }, { status: 404 });
  }

  if (!checkpoint) {
    return NextResponse.json({ error: 'Checkpoint not found.' }, { status: 404 });
  }

  const lessonProgress =
    (await prisma.lessonProgress.findFirst({
      where: { studentId: user.id, lessonId: checkpoint.lessonId },
    })) ?? null;

  const normalizedQuestions = checkpoint.questions.map((question) => normalizeCheckpointQuestion(question));
  const evaluation = evaluateAttempt(payload.answers, normalizedQuestions);
  const isPassing = normalizedQuestions.length === 0 || evaluation.every((entry) => entry.isCorrect === true);

  const attempt = await prisma.$transaction(async (tx) => {
    const created = await tx.checkpointAttempt.create({
      data: {
        checkpointId,
        userId: user.id,
        lessonProgressId: lessonProgress?.id ?? null,
        isPassing,
        completedAt: new Date(),
        responses: {
          create: evaluation.map((entry) => ({
            checkpointId,
            questionId: entry.questionId,
            studentId: user.id,
            lessonProgressId: lessonProgress?.id ?? null,
            selectedIndex: entry.selectedIndex,
            isCorrect: entry.isCorrect,
          })),
        },
      },
      include: {
        responses: true,
      },
    });

    if (isPassing && checkpoint.segmentId && lessonProgress) {
      await tx.segmentProgress.upsert({
        where: {
          lessonProgressId_segmentId: {
            lessonProgressId: lessonProgress.id,
            segmentId: checkpoint.segmentId,
          },
        },
        update: {
          status: 'COMPLETED',
          completedAt: new Date(),
        },
        create: {
          lessonProgressId: lessonProgress.id,
          segmentId: checkpoint.segmentId,
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      });
    }

    return created;
  });

  return NextResponse.json({
    attemptId: attempt.id,
    isPassing,
    questions: evaluation,
  });
}
