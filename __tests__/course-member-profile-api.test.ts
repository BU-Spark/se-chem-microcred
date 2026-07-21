/** @jest-environment node */

import { NextRequest } from 'next/server';
import { BadgeStatus, CourseRole, EnrollmentStatus, LessonStatus } from '@prisma/client';

import { GET } from '../app/api/courses/[courseId]/students/[studentId]/route';
import { fetchAccessibleCourseMemberDetail, fetchUserByEmail } from '../app/api/courses/lib/course-queries';
import { prisma } from '../lib/prisma';

jest.mock('../app/api/courses/lib/course-queries', () => ({
  fetchAccessibleCourseMemberDetail: jest.fn(),
  fetchUserByEmail: jest.fn(),
}));

jest.mock('../lib/prisma', () => {
  const prisma = {
    enrollment: {
      findMany: jest.fn(),
    },
  };

  return { __esModule: true, default: prisma, prisma };
});

const mockFetchAccessibleCourseMemberDetail = fetchAccessibleCourseMemberDetail as jest.MockedFunction<
  typeof fetchAccessibleCourseMemberDetail
>;
const mockFetchUserByEmail = fetchUserByEmail as jest.MockedFunction<typeof fetchUserByEmail>;
const mockFindManyEnrollments = prisma.enrollment.findMany as jest.MockedFunction<typeof prisma.enrollment.findMany>;

function profileRequest() {
  return new NextRequest('http://localhost/api/courses/course-1/students/student-1?email=prof%40example.edu');
}

function routeContext() {
  return {
    params: Promise.resolve({ courseId: 'course-1', studentId: 'student-1' }),
  };
}

function badge(id: string, name: string) {
  return {
    id,
    slug: id,
    name,
    description: null,
  };
}

function courseFixture({ seededLearningBadgeStarted }: { seededLearningBadgeStarted: boolean }) {
  const createdAt = new Date('2026-03-20T15:30:00.000Z');
  const startedAt = seededLearningBadgeStarted ? new Date('2026-03-21T12:00:00.000Z') : null;

  return {
    id: 'course-1',
    title: 'Chem101',
    createdById: 'prof-1',
    settings: {
      id: 'settings-1',
      courseId: 'course-1',
      allowAssessorMessages: true,
      allowCooldownOverride: false,
      allowCrossSectionView: true,
      createdAt,
      updatedAt: createdAt,
    },
    createdBy: {
      id: 'prof-1',
      name: 'Professor Demo',
      email: 'prof@example.edu',
      externalId: 'P111',
    },
    contacts: [],
    lessons: [
      {
        id: 'lesson-seeded',
        progress: [],
        badgeRequirements: [
          {
            id: 'requirement-seeded',
            summary: null,
            badge: badge('badge-seeded', 'Seeded Learning Badge'),
          },
        ],
      },
      {
        id: 'lesson-started',
        progress: [
          {
            status: seededLearningBadgeStarted ? LessonStatus.IN_PROGRESS : LessonStatus.NOT_STARTED,
            startedAt,
            completedAt: null,
            percentComplete: seededLearningBadgeStarted ? 20 : 0,
          },
        ],
        badgeRequirements: [
          {
            id: 'requirement-started',
            summary: null,
            badge: badge('badge-started', 'Actually Started Badge'),
          },
        ],
      },
    ],
    enrollments: [
      {
        id: 'enrollment-prof',
        role: CourseRole.INSTRUCTOR,
        status: EnrollmentStatus.ACTIVE,
        sections: [],
        student: {
          id: 'prof-1',
          name: 'Professor Demo',
          email: 'prof@example.edu',
          externalId: 'P111',
          gender: null,
          raceEthnicity: null,
          parentalEducation: null,
          pellGrantQualified: null,
          createdAt,
          avatar: null,
          badgeProgress: [],
        },
      },
      {
        id: 'enrollment-student',
        role: CourseRole.STUDENT,
        status: EnrollmentStatus.ACTIVE,
        sections: [{ section: 'K1' }],
        student: {
          id: 'student-1',
          name: 'Jane Student',
          email: 'student@example.edu',
          externalId: 'U11111111',
          gender: null,
          raceEthnicity: null,
          parentalEducation: null,
          pellGrantQualified: null,
          createdAt,
          avatar: null,
          badgeProgress: [
            {
              id: 'student-badge-seeded',
              badgeId: 'badge-seeded',
              status: BadgeStatus.LEARNING,
              awardedAt: null,
              score: null,
              badge: badge('badge-seeded', 'Seeded Learning Badge'),
            },
            {
              id: 'student-badge-started',
              badgeId: 'badge-started',
              status: BadgeStatus.LEARNING,
              awardedAt: null,
              score: null,
              badge: badge('badge-started', 'Actually Started Badge'),
            },
          ],
        },
      },
    ],
  };
}

describe('course member profile API badge grouping', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFindManyEnrollments.mockResolvedValue([]);
    mockFetchUserByEmail.mockResolvedValue({
      id: 'prof-1',
      email: 'prof@example.edu',
      name: 'Professor Demo',
      externalId: 'P111',
      avatar: null,
    });
  });

  it('groups seeded LEARNING badges with no started lesson as not yet started', async () => {
    mockFetchAccessibleCourseMemberDetail.mockResolvedValue(courseFixture({ seededLearningBadgeStarted: false }));

    const response = await GET(profileRequest(), routeContext());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.badges.notStarted).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'badge-seeded' })]));
    expect(body.badges.inProgress).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'badge-seeded' })])
    );
  });

  it('keeps LEARNING badges with started lesson activity in progress', async () => {
    mockFetchAccessibleCourseMemberDetail.mockResolvedValue(courseFixture({ seededLearningBadgeStarted: true }));

    const response = await GET(profileRequest(), routeContext());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.badges.inProgress).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'badge-started' })]));
    expect(body.badges.notStarted).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'badge-started' })])
    );
  });
});
