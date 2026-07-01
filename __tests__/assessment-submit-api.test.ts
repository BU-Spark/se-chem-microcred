/** @jest-environment node */

import { NextRequest } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';

import { POST } from '../app/api/courses/[courseId]/students/[studentId]/badges/[badgeId]/route';
import { fetchUserByEmail } from '../app/api/courses/lib/course-queries';
import prisma from '../lib/prisma';

jest.mock('@clerk/nextjs/server', () => ({
  currentUser: jest.fn(),
}));

jest.mock('../app/api/courses/lib/course-queries', () => ({
  fetchUserByEmail: jest.fn(),
}));

jest.mock('../lib/prisma', () => ({
  __esModule: true,
  default: {
    course: {
      findFirst: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

const mockCurrentUser = currentUser as jest.MockedFunction<typeof currentUser>;
const mockFetchUserByEmail = fetchUserByEmail as jest.MockedFunction<typeof fetchUserByEmail>;
const mockPrisma = prisma as unknown as {
  course: { findFirst: jest.Mock };
  $transaction: jest.Mock;
};

function assessmentRequest() {
  return new NextRequest(
    'http://localhost/api/courses/course-1/students/student-1/badges/badge-1?email=assessor@example.edu',
    {
      method: 'POST',
      body: JSON.stringify({
        passed: true,
        score: 100,
        feedback: 'Looks good.',
        criteria: [{ criterion: 'Overall performance', passed: true, sortOrder: 0 }],
      }),
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

describe('POST /api/courses/[courseId]/students/[studentId]/badges/[badgeId]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCurrentUser.mockResolvedValue({
      emailAddresses: [{ emailAddress: 'assessor@example.edu' }],
    } as Awaited<ReturnType<typeof currentUser>>);
    mockFetchUserByEmail.mockResolvedValue({ id: 'assessor-1' } as Awaited<ReturnType<typeof fetchUserByEmail>>);
  });

  it('rejects stale assessment submissions after a badge has already been assessed', async () => {
    mockPrisma.course.findFirst.mockResolvedValue({
      id: 'course-1',
      createdById: 'creator-1',
      settings: { allowCrossSectionView: true },
      enrollments: [
        {
          role: 'CHECKER',
          status: 'ACTIVE',
          sections: [{ section: 'A1' }],
          student: { id: 'assessor-1', badgeProgress: [] },
        },
        {
          role: 'STUDENT',
          status: 'ACTIVE',
          sections: [{ section: 'A1' }],
          student: {
            id: 'student-1',
            badgeProgress: [{ id: 'progress-1', status: 'READY_FOR_FINALIZATION' }],
          },
        },
      ],
      lessons: [
        {
          checkpoints: [{ attempts: [{ id: 'attempt-1' }] }],
        },
      ],
    });

    const response = await POST(assessmentRequest(), {
      params: Promise.resolve({ courseId: 'course-1', studentId: 'student-1', badgeId: 'badge-1' }),
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: 'This badge has already been assessed.' });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });
});
