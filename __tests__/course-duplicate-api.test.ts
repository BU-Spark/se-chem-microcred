/** @jest-environment node */

import { NextRequest } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
import { CourseContactType, CourseRole } from '@prisma/client';

import { POST } from '../app/api/courses/[courseId]/duplicate/route';
import prisma from '../lib/prisma';

jest.mock('@clerk/nextjs/server', () => ({
  currentUser: jest.fn(),
}));

jest.mock('../lib/prisma', () => ({
  __esModule: true,
  default: {
    user: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
    studentAnalytics: {
      createMany: jest.fn(),
    },
  },
}));

const mockCurrentUser = currentUser as jest.MockedFunction<typeof currentUser>;
const mockPrisma = prisma as unknown as {
  user: { findUnique: jest.Mock };
  $transaction: jest.Mock;
  studentAnalytics: { createMany: jest.Mock };
};

function duplicateCourse(courseId = 'source-course-1') {
  return POST(new NextRequest(`http://localhost/api/courses/${courseId}/duplicate`, { method: 'POST' }), {
    params: Promise.resolve({ courseId }),
  });
}

describe('POST /api/courses/[courseId]/duplicate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCurrentUser.mockResolvedValue({
      emailAddresses: [{ emailAddress: 'prof@example.edu' }],
    } as Awaited<ReturnType<typeof currentUser>>);
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'creator-1' });
  });

  it('does not copy checker contacts into the duplicated course', async () => {
    const tx = {
      course: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'source-course-1',
          title: 'Original Course',
          sectionCount: 2,
          description: 'Source description',
          settings: {
            allowCooldownOverride: true,
            allowAssessorMessages: true,
            allowCrossSectionView: false,
          },
          contacts: [
            {
              id: 'contact-1',
              type: CourseContactType.CHECKER,
              name: 'David Xiao',
              email: 'david.xiao@example.edu',
              avatarUrl: null,
            },
          ],
          lessons: [],
        }),
        create: jest.fn().mockResolvedValue({ id: 'copy-course-1', title: 'Copy of Original Course' }),
      },
      enrollment: {
        create: jest.fn().mockResolvedValue({ id: 'creator-enrollment-1' }),
      },
      courseContact: {
        createMany: jest.fn(),
      },
    };

    mockPrisma.$transaction.mockImplementation(async (callback) => callback(tx));
    mockPrisma.studentAnalytics.createMany.mockResolvedValue({ count: 1 });

    const response = await duplicateCourse();

    expect(response.status).toBe(201);
    expect(tx.courseContact.createMany).not.toHaveBeenCalled();
    expect(tx.enrollment.create).toHaveBeenCalledWith({
      data: {
        studentId: 'creator-1',
        courseId: 'copy-course-1',
        role: CourseRole.INSTRUCTOR,
      },
    });
  });
});
