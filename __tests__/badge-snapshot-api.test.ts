/** @jest-environment node */
// Integration test for GET /api/courses/[courseId]/badge-snapshot. The real route
// and classification run together; only Prisma and the signed-in user are mocked.

import { NextRequest } from 'next/server';
import { BadgeStatus } from '@prisma/client';

import { GET } from '../app/api/courses/[courseId]/badge-snapshot/route';
import { ensureCurrentUser } from '../app/api/courses/lib/ensure-user';
import { prisma } from '../lib/prisma';

jest.mock('../lib/prisma', () => {
  const prisma = {
    course: { findUnique: jest.fn() },
    enrollment: { findMany: jest.fn() },
    studentBadge: { findMany: jest.fn() },
    lessonProgress: { findMany: jest.fn() },
    assessmentAttempt: { findMany: jest.fn() },
  };
  return { __esModule: true, default: prisma, prisma };
});

jest.mock('../app/api/courses/lib/ensure-user', () => ({ ensureCurrentUser: jest.fn() }));

const mockEnsureCurrentUser = ensureCurrentUser as jest.MockedFunction<typeof ensureCurrentUser>;
const mockFindCourse = prisma.course.findUnique as unknown as jest.Mock;
const mockFindEnrollments = prisma.enrollment.findMany as unknown as jest.Mock;
const mockFindStudentBadges = prisma.studentBadge.findMany as unknown as jest.Mock;
const mockFindLessonProgress = prisma.lessonProgress.findMany as unknown as jest.Mock;
const mockFindAttempts = prisma.assessmentAttempt.findMany as unknown as jest.Mock;

const VIEWER = { id: 'viewer-1', email: 'viewer@example.edu' } as Awaited<ReturnType<typeof ensureCurrentUser>>;

const LESSONS = [
  { id: 'l1', badgeRequirements: [{ badge: { id: 'b1', name: 'Pipetting', slug: 'pipetting' } }] },
  { id: 'l2', badgeRequirements: [{ badge: { id: 'b2', name: 'Titration', slug: 'titration' } }] },
];

function course(overrides: Record<string, unknown> = {}) {
  return {
    createdById: 'prof-1',
    settings: { allowCrossSectionView: false },
    enrollments: [{ role: 'CHECKER', sections: [{ section: 'A1' }] }],
    lessons: LESSONS,
    ...overrides,
  };
}

function request(section?: string) {
  const query = section ? `?section=${encodeURIComponent(section)}` : '';
  return new NextRequest(`http://localhost/api/courses/course-1/badge-snapshot${query}`);
}

const context = { params: Promise.resolve({ courseId: 'course-1' }) };

describe('GET /api/courses/[courseId]/badge-snapshot', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockEnsureCurrentUser.mockResolvedValue(VIEWER);
    mockFindCourse.mockResolvedValue(course());
    mockFindEnrollments.mockResolvedValue([{ studentId: 's1' }, { studentId: 's2' }]);
    mockFindStudentBadges.mockResolvedValue([
      { studentId: 's1', badgeId: 'b1', status: BadgeStatus.COMPLETED, awardedAt: new Date() },
    ]);
    mockFindLessonProgress.mockResolvedValue([]);
    mockFindAttempts.mockResolvedValue([{ studentId: 's2', badgeId: 'b2', passed: false }]);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns 401 when signed out', async () => {
    mockEnsureCurrentUser.mockResolvedValue(null);
    const response = await GET(request(), context);
    expect(response.status).toBe(401);
  });

  it('returns 404 for a student viewer', async () => {
    mockFindCourse.mockResolvedValue(course({ enrollments: [{ role: 'STUDENT', sections: [] }] }));
    const response = await GET(request(), context);
    expect(response.status).toBe(404);
    expect(mockFindEnrollments).not.toHaveBeenCalled();
  });

  it('returns 404 for a viewer with no active enrollment', async () => {
    mockFindCourse.mockResolvedValue(course({ enrollments: [] }));
    const response = await GET(request(), context);
    expect(response.status).toBe(404);
  });

  it('returns compact per-student states in badge order with a fixed number of queries', async () => {
    const response = await GET(request(), context);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.badges.map((badge: { id: string }) => badge.id)).toEqual(['b1', 'b2']);
    expect(body.students).toEqual({ s1: ['done', 'not_started'], s2: ['not_started', 'failed'] });

    expect(mockFindCourse).toHaveBeenCalledTimes(1);
    expect(mockFindEnrollments).toHaveBeenCalledTimes(1);
    expect(mockFindStudentBadges).toHaveBeenCalledTimes(1);
    expect(mockFindLessonProgress).toHaveBeenCalledTimes(1);
    expect(mockFindAttempts).toHaveBeenCalledTimes(1);
    expect(mockFindStudentBadges.mock.calls[0][0].where.studentId).toEqual({ in: ['s1', 's2'] });
  });

  it('scopes a checker to their own sections plus unsectioned students', async () => {
    await GET(request(), context);
    expect(mockFindEnrollments.mock.calls[0][0].where).toMatchObject({
      courseId: 'course-1',
      role: 'STUDENT',
      status: 'ACTIVE',
      OR: [{ sections: { some: { section: { in: ['A1'] } } } }, { sections: { none: {} } }],
    });
  });

  it('returns no students when a scoped checker asks for another section', async () => {
    const response = await GET(request('B2'), context);
    const body = await response.json();
    expect(body.students).toEqual({});
    expect(mockFindEnrollments).not.toHaveBeenCalled();
  });

  it('filters to the requested section the checker belongs to', async () => {
    await GET(request('A1'), context);
    expect(mockFindEnrollments.mock.calls[0][0].where.sections).toEqual({ some: { section: 'A1' } });
    expect(mockFindEnrollments.mock.calls[0][0].where.OR).toBeUndefined();
  });

  it('lets a checker view any section when cross-section view is allowed', async () => {
    mockFindCourse.mockResolvedValue(course({ settings: { allowCrossSectionView: true } }));
    await GET(request('B2'), context);
    expect(mockFindEnrollments.mock.calls[0][0].where.sections).toEqual({ some: { section: 'B2' } });
  });

  it('does not section-scope the course creator', async () => {
    mockFindCourse.mockResolvedValue(course({ createdById: 'viewer-1', enrollments: [] }));
    await GET(request(), context);
    const where = mockFindEnrollments.mock.calls[0][0].where;
    expect(where.OR).toBeUndefined();
    expect(where.sections).toBeUndefined();
  });

  it('skips progress queries when the course has no badges', async () => {
    mockFindCourse.mockResolvedValue(course({ lessons: [] }));
    const response = await GET(request(), context);
    const body = await response.json();
    expect(body).toMatchObject({ badges: [], students: { s1: [], s2: [] } });
    expect(mockFindStudentBadges).not.toHaveBeenCalled();
  });
});
