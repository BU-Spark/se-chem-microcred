/** @jest-environment node */

import { POST } from '../app/api/badges/[badgeId]/survey/route';
import { reconcileStudentBadgeCourse } from '../lib/badges/badge-satisfaction.service';
import prisma from '../lib/prisma';

jest.mock('../lib/badges/badge-satisfaction.service', () => ({
  reconcileStudentBadgeCourse: jest.fn(async () => ({ awarded: 1, revoked: 0, repointed: 0 })),
}));

const mockTx = {
  surveyResponse: { findFirst: jest.fn(async () => null), create: jest.fn(), update: jest.fn() },
  studentBadge: { update: jest.fn(async () => ({ status: 'COMPLETED' })) },
};

jest.mock('../lib/prisma', () => ({
  __esModule: true,
  default: {
    user: { findUnique: jest.fn() },
    studentBadge: { findFirst: jest.fn() },
    surveyPrompt: { findFirst: jest.fn() },
    assessmentAttempt: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  },
}));

const mockPrisma = prisma as unknown as {
  user: { findUnique: jest.Mock };
  studentBadge: { findFirst: jest.Mock };
  surveyPrompt: { findFirst: jest.Mock };
  assessmentAttempt: { findFirst: jest.Mock };
  $transaction: jest.Mock;
};

function finalize() {
  return POST(
    new Request('http://localhost/api/badges/run-copy/survey', {
      method: 'POST',
      body: JSON.stringify({ email: 'student@example.edu', rating: 5 }),
    }),
    { params: Promise.resolve({ badgeId: 'run-copy' }) }
  );
}

describe('POST /api/badges/[badgeId]/survey (finalize) SATISFIES hook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'student-1' });
    mockPrisma.surveyPrompt.findFirst.mockResolvedValue({ id: 'prompt-1' });
    mockPrisma.assessmentAttempt.findFirst.mockResolvedValue({ passed: true });
    mockPrisma.$transaction.mockImplementation((callback: (tx: typeof mockTx) => unknown) => callback(mockTx));
  });

  it('awards the badges Run earns in the same transaction that completes Run', async () => {
    mockPrisma.studentBadge.findFirst.mockResolvedValue({
      id: 'sb-run',
      status: 'IN_REVIEW',
      awardedAt: null,
      feedbackReviewedAt: null,
    });

    const response = await finalize();

    expect(response.status).toBe(200);
    expect(mockTx.studentBadge.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'COMPLETED' }) })
    );
    expect(reconcileStudentBadgeCourse).toHaveBeenCalledWith(mockTx, { studentId: 'student-1', badgeId: 'run-copy' });
  });

  it('does not reconcile when the badge was already completed', async () => {
    mockPrisma.studentBadge.findFirst.mockResolvedValue({ id: 'sb-run', status: 'COMPLETED' });

    const response = await finalize();

    expect(response.status).toBe(200);
    expect(reconcileStudentBadgeCourse).not.toHaveBeenCalled();
  });
});
