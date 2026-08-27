// Issues: #258 multi-word last names
import { GET } from '@/app/api/dashboard/analytics/route';
import { ensureCurrentUser } from '@/app/api/courses/lib/ensure-user';
import prisma from '@/lib/prisma';

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));
jest.mock('@/app/api/courses/lib/ensure-user', () => ({ ensureCurrentUser: jest.fn() }));
jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    course: { findMany: jest.fn() },
    badge: { count: jest.fn(), findMany: jest.fn() },
    enrollment: { findMany: jest.fn(), count: jest.fn() },
    studentBadge: { count: jest.fn(), findMany: jest.fn() },
    lesson: { findMany: jest.fn() },
  },
}));

const mockEnsureCurrentUser = ensureCurrentUser as jest.MockedFunction<typeof ensureCurrentUser>;
const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe('GET /api/dashboard/analytics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEnsureCurrentUser.mockResolvedValue({
      id: 'user-1',
      name: 'Test User',
      email: 'test@example.edu',
      externalId: 'clerk-user-1',
      firstName: null,
      lastName: null,
      avatar: null,
    });

    (mockPrisma.course.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'taught-1',
        enrollments: [{ role: 'STUDENT' }, { role: 'CHECKER' }],
        lessons: [
          {
            badgeRequirements: [
              {
                badge: {
                  id: 'badge-taught-1',
                  availableOn: null,
                  closesOn: new Date(Date.now() + 86_400_000),
                  neverCloses: false,
                },
              },
            ],
          },
        ],
      },
    ]);
    (mockPrisma.enrollment.findMany as jest.Mock)
      .mockResolvedValueOnce([{ courseId: 'student-1' }])
      .mockResolvedValueOnce([{ courseId: 'checked-1', sections: [{ section: 'A1' }] }])
      .mockResolvedValueOnce([]);
    (mockPrisma.studentBadge.count as jest.Mock)
      .mockResolvedValueOnce(6)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1);
    (mockPrisma.enrollment.count as jest.Mock).mockResolvedValue(3);
    (mockPrisma.badge.count as jest.Mock).mockResolvedValueOnce(4).mockResolvedValueOnce(2);
    (mockPrisma.lesson.findMany as jest.Mock).mockResolvedValue([
      { courseId: 'student-1', progress: [] },
      { courseId: 'student-1', progress: [{ status: 'IN_PROGRESS' }] },
      { courseId: 'student-1', progress: [] },
      { courseId: 'student-1', progress: [] },
      { courseId: 'student-1', progress: [{ status: 'COMPLETED' }] },
    ]);
    (mockPrisma.studentBadge.findMany as jest.Mock)
      .mockResolvedValueOnce([
        {
          badge: {
            closesOn: new Date(Date.now() - 86_400_000),
            neverCloses: false,
            requirements: [{ lesson: { courseId: 'student-1' } }],
          },
        },
        {
          badge: {
            closesOn: new Date(Date.now() + 86_400_000),
            neverCloses: false,
            requirements: [{ lesson: { courseId: 'student-1' } }],
          },
        },
        { badge: { closesOn: null, neverCloses: true, requirements: [] } },
      ])
      .mockResolvedValueOnce([
        {
          status: 'READY_FOR_ASSESSMENT',
          cooldownUntil: null,
          student: { id: 'student-a', enrollments: [{ courseId: 'checked-1', sections: [{ section: 'A1' }] }] },
          badge: { requirements: [{ lesson: { courseId: 'checked-1' } }] },
        },
        {
          status: 'READY_FOR_ASSESSMENT',
          cooldownUntil: null,
          student: { id: 'student-b', enrollments: [{ courseId: 'checked-1', sections: [{ section: 'B2' }] }] },
          badge: { requirements: [{ lesson: { courseId: 'checked-1' } }] },
        },
        {
          status: 'IN_REVIEW',
          cooldownUntil: null,
          student: { id: 'student-a', enrollments: [{ courseId: 'checked-1', sections: [{ section: 'A1' }] }] },
          badge: { requirements: [{ lesson: { courseId: 'checked-1' } }] },
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    (mockPrisma.badge.findMany as jest.Mock)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'active-checker-badge', requirements: [{ lesson: { courseId: 'checked-1' } }] }]);
  });

  it('returns action-oriented metrics and respects checker section scope', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      instructor: {
        readyForAssessment: 6,
        awaitingStudentReview: 2,
        pendingCheckerRequests: 3,
        upcomingDeadlines: 4,
      },
      student: {
        lessonsNotStarted: 3,
        lessonsInProgress: 1,
        lessonsCompleted: 1,
        readyForAssessment: 1,
        upcomingDeadlines: 1,
        overdueLessons: 1,
      },
      checker: { readyForAssessment: 1, awaitingStudentReview: 1, upcomingDeadlines: 2 },
      byCourse: {
        instructor: { 'taught-1': { students: 1, checkers: 1, activeBadges: 1 } },
        student: {
          'student-1': {
            lessonsNotStarted: 3,
            lessonsInProgress: 1,
            lessonsCompleted: 1,
            overdueLessons: 1,
            upcomingDeadlines: 1,
          },
        },
        checker: {
          'checked-1': {
            sections: 1,
            readyForAssessment: 1,
            awaitingStudentReview: 1,
            studentsToAssess: 1,
            activeBadges: 1,
          },
        },
      },
      windowDays: 14,
    });
  });
});
/** @jest-environment node */
