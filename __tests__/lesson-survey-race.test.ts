/** @jest-environment node */

import { NextResponse } from 'next/server';
import { POST } from '../app/api/lessons/[lessonId]/survey/route';

const badgeState = { status: 'LEARNING' as 'LEARNING' | 'READY_FOR_ASSESSMENT' };
const updateSpy = jest.fn();

jest.mock('../lib/prisma', () => {
  const lessonProgress = { id: 'lp-1', status: 'IN_PROGRESS', percentComplete: 0, completedAt: null };
  let txChain = Promise.resolve();
  return {
    __esModule: true,
    default: {
      $transaction: async (cb: (tx: Record<string, unknown>) => unknown) => {
        txChain = txChain.then(async () => {
          const tx = {
            surveyPrompt: {
              findFirst: jest.fn().mockResolvedValue({ id: 'prompt-1', question: 'Q?' }),
              create: jest.fn(),
            },
            lessonProgress: {
              findFirst: jest.fn().mockResolvedValue({ ...lessonProgress }),
              create: jest.fn().mockResolvedValue({ ...lessonProgress }),
              update: jest.fn().mockImplementation(async (args: { data: Partial<typeof lessonProgress> }) => {
                Object.assign(lessonProgress, args.data);
                return { ...lessonProgress };
              }),
            },
            surveyResponse: {
              findFirst: jest.fn().mockResolvedValue(null),
              update: jest.fn(),
              create: jest.fn(),
            },
            lessonCheckpoint: {
              findMany: jest.fn().mockResolvedValue([{ id: 'cp1' }]),
            },
            checkpointAttempt: {
              findMany: jest.fn().mockResolvedValue([{ checkpointId: 'cp1' }]),
            },
            badgeRequirement: {
              findFirst: jest.fn().mockResolvedValue({ badgeId: 'badge-1' }),
            },
            studentBadge: {
              findUnique: jest.fn().mockResolvedValue({ id: 'sb-1', status: badgeState.status }),
              update: jest.fn().mockImplementation(async () => {
                badgeState.status = 'READY_FOR_ASSESSMENT';
                updateSpy();
                return { id: 'sb-1', status: badgeState.status };
              }),
            },
          };
          return cb(tx);
        });
        return txChain;
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 'user-1' }),
      },
      lesson: {
        findUnique: jest.fn().mockResolvedValue({ id: 'lesson-1', title: 'Lesson' }),
      },
    },
  };
});

const buildRequest = (body: unknown) =>
  new Request('http://localhost/api/lessons/lesson-1/survey', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('Lesson survey badge promotion concurrency', () => {
  beforeEach(() => {
    badgeState.status = 'LEARNING';
    updateSpy.mockClear();
  });

  it('only promotes badge once when two requests race', async () => {
    const payload = { email: 'student@example.edu', rating: 5, videoCompleted: true };
    const [res1, res2] = await Promise.all([
      POST(buildRequest(payload), { params: Promise.resolve({ lessonId: 'lesson-1' }) }),
      POST(buildRequest(payload), { params: Promise.resolve({ lessonId: 'lesson-1' }) }),
    ]);

    expect(res1).toBeInstanceOf(NextResponse);
    expect(res2).toBeInstanceOf(NextResponse);
    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(badgeState.status).toBe('READY_FOR_ASSESSMENT');
  });
});
