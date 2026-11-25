/** @jest-environment node */
// Integration test for GET /api/courses/[courseId]/badge-snapshot. The real route
// runs; only Clerk and Prisma are mocked.

import { NextRequest } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';

import { GET } from '../app/api/courses/[courseId]/badge-snapshot/route';
import { prisma } from '../lib/prisma';
import { COMPLETED_BADGE_WHERE } from '../lib/roster/badgeSnapshot';

jest.mock('@clerk/nextjs/server', () => ({ currentUser: jest.fn() }));

jest.mock('../lib/prisma', () => {
  const prisma = {
    course: { findUnique: jest.fn() },
    badgeRequirement: { findMany: jest.fn() },
    studentBadge: { groupBy: jest.fn() },
  };
  return { __esModule: true, default: prisma, prisma };
});

const mockCurrentUser = currentUser as unknown as jest.Mock;
const mockFindCourse = prisma.course.findUnique as unknown as jest.Mock;
const mockFindRequirements = prisma.badgeRequirement.findMany as unknown as jest.Mock;
const mockGroupBy = prisma.studentBadge.groupBy as unknown as jest.Mock;

function course(overrides: Record<string, unknown> = {}) {
  return {
    createdBy: { email: 'prof@bu.edu' },
    settings: { allowCrossSectionView: false },
    enrollments: [{ role: 'CHECKER', sections: [{ section: 'A1' }] }],
    ...overrides,
  };
}

function request(section?: string) {
  const query = section ? `?section=${encodeURIComponent(section)}` : '';
  return new NextRequest(`http://localhost/api/courses/course-1/badge-snapshot${query}`);
}

const context = { params: Promise.resolve({ courseId: 'course-1' }) };
const enrollmentFilter = () => mockGroupBy.mock.calls[0][0].where.student.enrollments.some;

describe('GET /api/courses/[courseId]/badge-snapshot', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockCurrentUser.mockResolvedValue({ emailAddresses: [{ emailAddress: 'Checker@BU.edu' }] });
    mockFindCourse.mockResolvedValue(course());
    mockFindRequirements.mockResolvedValue([{ badgeId: 'b1' }, { badgeId: 'b2' }]);
    mockGroupBy.mockResolvedValue([{ studentId: 's1', _count: { _all: 2 } }]);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns 401 when signed out', async () => {
    mockCurrentUser.mockResolvedValue(null);
    const response = await GET(request(), context);
    expect(response.status).toBe(401);
    expect(mockFindCourse).not.toHaveBeenCalled();
  });

  it('returns 404 when the viewer is not course staff', async () => {
    mockFindCourse.mockResolvedValue(course({ enrollments: [] }));
    const response = await GET(request(), context);
    expect(response.status).toBe(404);
    expect(mockGroupBy).not.toHaveBeenCalled();
  });

  it('returns 404 for an unknown course', async () => {
    mockFindCourse.mockResolvedValue(null);
    const response = await GET(request(), context);
    expect(response.status).toBe(404);
  });

  it('looks the viewer up by session email and never writes', async () => {
    await GET(request(), context);
    expect(mockFindCourse.mock.calls[0][0].select.enrollments.where).toMatchObject({
      status: 'ACTIVE',
      student: { email: 'checker@bu.edu' },
    });
  });

  it('counts completed badges per student in one grouped query', async () => {
    const response = await GET(request(), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ badgeCount: 2, completed: { s1: 2 } });

    expect(mockFindCourse).toHaveBeenCalledTimes(1);
    expect(mockFindRequirements).toHaveBeenCalledTimes(1);
    expect(mockGroupBy).toHaveBeenCalledTimes(1);
    const args = mockGroupBy.mock.calls[0][0];
    expect(args.by).toEqual(['studentId']);
    expect(args.where).toMatchObject({ ...COMPLETED_BADGE_WHERE, badgeId: { in: ['b1', 'b2'] } });
    expect(enrollmentFilter()).toMatchObject({ courseId: 'course-1', role: 'STUDENT', status: 'ACTIVE' });
  });

  it('scopes a checker to their own sections plus unsectioned students', async () => {
    await GET(request(), context);
    expect(enrollmentFilter().OR).toEqual([
      { sections: { some: { section: { in: ['A1'] } } } },
      { sections: { none: {} } },
    ]);
  });

  it('returns no counts when a scoped checker asks for another section', async () => {
    const response = await GET(request('B2'), context);
    expect((await response.json()).completed).toEqual({});
    expect(mockGroupBy).not.toHaveBeenCalled();
  });

  it('filters to a requested section the checker belongs to', async () => {
    await GET(request('A1'), context);
    expect(enrollmentFilter().sections).toEqual({ some: { section: 'A1' } });
    expect(enrollmentFilter().OR).toBeUndefined();
  });

  it('lets a checker view any section when cross-section view is allowed', async () => {
    mockFindCourse.mockResolvedValue(course({ settings: { allowCrossSectionView: true } }));
    await GET(request('B2'), context);
    expect(enrollmentFilter().sections).toEqual({ some: { section: 'B2' } });
  });

  it('does not section-scope the course creator', async () => {
    mockCurrentUser.mockResolvedValue({ emailAddresses: [{ emailAddress: 'prof@bu.edu' }] });
    mockFindCourse.mockResolvedValue(course({ enrollments: [] }));
    await GET(request(), context);
    expect(enrollmentFilter().OR).toBeUndefined();
    expect(enrollmentFilter().sections).toBeUndefined();
  });

  it('skips the count when the course has no badges', async () => {
    mockFindRequirements.mockResolvedValue([]);
    const response = await GET(request(), context);
    expect(await response.json()).toMatchObject({ badgeCount: 0, completed: {} });
    expect(mockGroupBy).not.toHaveBeenCalled();
  });
});
