import { NextResponse } from 'next/server';
import prisma from '../../../../../lib/prisma';
import {
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
    numericAnswer?: number | null;
  }>;
}

type RouteContext = {
  params: Promise<{
    checkpointId: string;
  }>;
};

class AttemptValidationError extends Error {
  constructor(
    message: string,
    public code: 'MISSING_ANSWER' | 'NUMERIC_REQUIRED' | 'QUESTION_MISCONFIGURED'
  ) {
    super(message);
  }
}

function evaluateAttempt(answers: AttemptRequestBody['answers'], questions: NormalizedCheckpointQuestion[]) {
  return questions.map((question) => {
    const answer = answers?.find((item) => item.questionId === question.id);

    if (question.type === 'shortAnswer') {
      if (!answer) {
        throw new AttemptValidationError('Missing short answer response.', 'MISSING_ANSWER');
      }
      const numericAnswer = parseNumericAnswer(answer.numericAnswer ?? null);
      if (numericAnswer === null) {
        throw new AttemptValidationError('Numeric answer required.', 'NUMERIC_REQUIRED');
      }
      if (question.expectedAnswer == null) {
        throw new AttemptValidationError('Short answer question missing expected answer.', 'QUESTION_MISCONFIGURED');
      }
      const isCorrect = isAnswerWithinTolerance(question.expectedAnswer, numericAnswer, question.tolerancePercent ?? 0);
      return {
        questionId: question.id,
        prompt: question.prompt,
        options: question.options,
        selectedIndex: null,
        numericAnswer,
        correctIndex: null,
        expectedAnswer: question.expectedAnswer,
        tolerancePercent: question.tolerancePercent,
        type: question.type,
        isCorrect,
      };
    }

    const selectedIndex = typeof answer?.selectedIndex === 'number' ? answer.selectedIndex : null;
    const isCorrect = selectedIndex !== null && selectedIndex === (question.correctIndex ?? null);

    return {
      questionId: question.id,
      prompt: question.prompt,
      options: question.options,
      selectedIndex,
      numericAnswer: null,
      correctIndex: question.correctIndex ?? null,
      expectedAnswer: question.expectedAnswer,
      tolerancePercent: question.tolerancePercent,
      type: question.type,
      isCorrect,
    };
  });
}

export async function POST(request: Request, context: RouteContext) {
  const { checkpointId } = await context.params;

  if (!checkpointId) {
    return NextResponse.json({ error: 'Missing checkpoint id.' }, { status: 400 });
  }

  let payload: AttemptRequestBody;

  try {
    payload = (await request.json()) as AttemptRequestBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
  }

  if (!payload.email || !payload.answers || !Array.isArray(payload.answers)) {
    return NextResponse.json({ error: 'Request must include email and answers.' }, { status: 400 });
  }

  const email = payload.email.trim().toLowerCase();
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

  let evaluation;
  try {
    const normalizedQuestions = checkpoint.questions.map((question) => normalizeCheckpointQuestion(question));
    evaluation = evaluateAttempt(payload.answers, normalizedQuestions);
  } catch (error) {
    if (error instanceof AttemptValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
  const isPassing = evaluation.every((entry) => entry.isCorrect);

  const attempt = await prisma.checkpointAttempt.create({
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
    await prisma.segmentProgress.upsert({
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

  return NextResponse.json({
    attemptId: attempt.id,
    isPassing,
    questions: evaluation,
  });
}
