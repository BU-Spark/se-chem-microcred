/** @jest-environment node */
// Issues: #247 badge image zoom, #258 multi-word last names

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
    assessmentAttempt: {
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
const mockFindManyAttempts = prisma.assessmentAttempt.findMany as jest.MockedFunction<
  typeof prisma.assessmentAttempt.findMany
>;

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
    imageUrl: null,
    imagePositionX: 50,
    imagePositionY: 50,
    imageScale: 115,
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
      allowCheckerMessages: true,
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
          firstName: 'Professor',
          lastName: 'Demo',
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
          firstName: 'Jane',
          lastName: 'Student',
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
    mockFindManyAttempts.mockResolvedValue([]);
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
    expect(body.badges.stillLearning).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'badge-seeded' })])
    );
  });

  it('keeps LEARNING badges with started lesson activity in progress', async () => {
    mockFetchAccessibleCourseMemberDetail.mockResolvedValue(courseFixture({ seededLearningBadgeStarted: true }));

    const response = await GET(profileRequest(), routeContext());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.badges.stillLearning).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'badge-started' })])
    );
    expect(body.badges.notStarted).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'badge-started' })])
    );
  });

  // The profile groups badges with the same rule as the course badge page
  // (lib/badgeCohorts.ts), so a failed in-person attempt outranks lesson progress.
  it('moves a badge with a failed in-person attempt into still learning', async () => {
    mockFetchAccessibleCourseMemberDetail.mockResolvedValue(courseFixture({ seededLearningBadgeStarted: false }));
    mockFindManyAttempts.mockResolvedValue([{ badgeId: 'badge-seeded', passed: false }] as never);

    const response = await GET(profileRequest(), routeContext());
    const body = await response.json();

    expect(body.badges.stillLearning).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'badge-seeded', stage: 'ATTEMPT_FAILED', attemptCount: 1 }),
      ])
    );
    expect(body.badges.notStarted).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'badge-seeded' })])
    );
  });

  // A student may be enrolled in several courses under different instructors, so
  // attempts are read for this course only.
  it('reads assessment attempts scoped to this course and student', async () => {
    mockFetchAccessibleCourseMemberDetail.mockResolvedValue(courseFixture({ seededLearningBadgeStarted: true }));

    await GET(profileRequest(), routeContext());

    expect(mockFindManyAttempts).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ courseId: 'course-1', studentId: 'student-1' }),
      })
    );
  });
  // A student may be enrolled with several instructors. The profile is scoped to
  // one course, so nothing from another course may appear — not in any cohort,
  // even when the student carries progress rows for those badges.
  describe('course scoping', () => {
    it('never surfaces a badge that no lesson in this course requires', async () => {
      const fixture = courseFixture({ seededLearningBadgeStarted: true });
      // Simulate the query leaking a foreign progress row: the badge belongs to a
      // different instructor's course and has no requirement here.
      fixture.enrollments[1].student.badgeProgress.push({
        id: 'student-badge-foreign',
        badgeId: 'badge-from-other-course',
        status: BadgeStatus.COMPLETED,
        awardedAt: new Date('2026-05-01T00:00:00.000Z'),
        score: 100,
        badge: badge('badge-from-other-course', 'Other Course Badge'),
      } as never);
      mockFetchAccessibleCourseMemberDetail.mockResolvedValue(fixture);

      const body = await (await GET(profileRequest(), routeContext())).json();

      const everyBadgeId = [...body.badges.proficient, ...body.badges.stillLearning, ...body.badges.notStarted].map(
        (entry: { id: string }) => entry.id
      );

      expect(everyBadgeId).not.toContain('badge-from-other-course');
      // Only this course's two badges are reported.
      expect(everyBadgeId.sort()).toEqual(['badge-seeded', 'badge-started']);
    });

    it('scopes the badge list to the lessons of the requested course', async () => {
      mockFetchAccessibleCourseMemberDetail.mockResolvedValue(courseFixture({ seededLearningBadgeStarted: true }));

      await GET(profileRequest(), routeContext());

      // The course lookup itself carries both the course id and the member id, so
      // a viewer cannot read a student who is not enrolled here.
      expect(mockFetchAccessibleCourseMemberDetail).toHaveBeenCalledWith('prof-1', 'course-1', 'student-1');
    });
  });
});
