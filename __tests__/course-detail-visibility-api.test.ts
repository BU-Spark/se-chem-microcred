/** @jest-environment node */
// GET /api/courses/[courseId] scopes the roster it returns: a checker without
// cross-section view must not receive other sections' students in the payload.

import { NextRequest } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';

import { GET } from '../app/api/courses/[courseId]/route';
import { fetchAccessibleCourseDetail, fetchUserByEmail } from '../app/api/courses/lib/course-queries';

jest.mock('@clerk/nextjs/server', () => ({ currentUser: jest.fn() }));

jest.mock('../app/api/courses/lib/course-queries', () => ({
  fetchAccessibleCourseDetail: jest.fn(),
  fetchUserByEmail: jest.fn(),
}));

jest.mock('../lib/badges/badge-relations.service', () => ({
  loadRelationsByRoot: jest.fn().mockResolvedValue(new Map()),
  resolveFamilyRootId: (badge: { id: string; sourceBadgeId: string | null }) => badge.sourceBadgeId ?? badge.id,
}));

jest.mock('../lib/prisma', () => {
  const prisma = { user: { findMany: jest.fn().mockResolvedValue([]) } };
  return { __esModule: true, default: prisma, prisma };
});

const mockCurrentUser = currentUser as unknown as jest.Mock;
const mockFetchUser = fetchUserByEmail as unknown as jest.Mock;
const mockFetchCourse = fetchAccessibleCourseDetail as unknown as jest.Mock;

function enrollment(
  id: string,
  role: 'STUDENT' | 'CHECKER',
  sections: string[],
  status: 'ACTIVE' | 'PENDING' = 'ACTIVE'
) {
  return {
    id: `enrollment-${id}`,
    role,
    status,
    studentId: id,
    sections: sections.map((section) => ({ section })),
    student: { id, name: id, firstName: null, lastName: null, email: `${id}@bu.edu`, externalId: null },
  };
}

function course(allowCrossSectionView = false) {
  return {
    id: 'course-1',
    createdById: 'prof',
    settings: { allowCrossSectionView },
    createdBy: null,
    contacts: [],
    lessons: [],
    enrollments: [
      enrollment('checker-a', 'CHECKER', ['A1']),
      enrollment('pending', 'CHECKER', [], 'PENDING'),
      enrollment('ada', 'STUDENT', ['A1']),
      enrollment('grace', 'STUDENT', ['B1']),
      enrollment('alan', 'STUDENT', []),
    ],
  };
}

async function getAs(userId: string, allowCrossSectionView = false) {
  mockCurrentUser.mockResolvedValue({ emailAddresses: [{ emailAddress: `${userId}@bu.edu` }] });
  mockFetchUser.mockResolvedValue({ id: userId });
  mockFetchCourse.mockResolvedValue(course(allowCrossSectionView));
  const response = await GET(new NextRequest('http://localhost/api/courses/course-1'), {
    params: Promise.resolve({ courseId: 'course-1' }),
  });
  const body = await response.json();
  return {
    status: response.status,
    body,
    ids: body.course?.enrollments.map((e: { studentId: string }) => e.studentId),
  };
}

describe('GET /api/courses/[courseId] roster visibility', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('returns only the checker’s own section and unsectioned students', async () => {
    const { status, body, ids } = await getAs('checker-a');
    expect(status).toBe(200);
    expect(body.viewerRole).toBe('CHECKER');
    expect(ids).toEqual(['checker-a', 'ada', 'alan']);
    expect(JSON.stringify(body)).not.toContain('grace@bu.edu');
    expect(body.course.enrollments[1].sections).toEqual(['A1']);
  });

  it('returns every active student when cross-section view is allowed', async () => {
    const { ids } = await getAs('checker-a', true);
    expect(ids).toEqual(['checker-a', 'ada', 'grace', 'alan']);
  });

  it('returns the full roster, pending requests included, to the instructor', async () => {
    const { body, ids } = await getAs('prof');
    expect(body.viewerRole).toBe('INSTRUCTOR');
    expect(ids).toEqual(['checker-a', 'pending', 'ada', 'grace', 'alan']);
  });
});
