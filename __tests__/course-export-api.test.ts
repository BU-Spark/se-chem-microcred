/** @jest-environment node */

import { NextRequest } from 'next/server';

import { GET } from '../app/api/courses/[courseId]/export/route';
import { fetchAccessibleCourseDetail, fetchUserByEmail } from '../app/api/courses/lib/course-queries';
import { loadCourseSatisfiesEdges, type CourseBadge } from '../lib/badges/badge-relations.service';
import prisma from '../lib/prisma';

jest.mock('../app/api/courses/lib/course-queries', () => ({
  fetchUserByEmail: jest.fn(),
  fetchAccessibleCourseDetail: jest.fn(),
}));

jest.mock('../lib/badges/badge-relations.service', () => ({
  loadCourseSatisfiesEdges: jest.fn(),
}));

jest.mock('../lib/prisma', () => ({
  __esModule: true,
  default: {
    studentBadge: { findMany: jest.fn() },
    lessonProgress: { findMany: jest.fn() },
  },
}));

const mockFetchUser = fetchUserByEmail as jest.Mock;
const mockFetchCourse = fetchAccessibleCourseDetail as jest.Mock;
const mockSatisfies = loadCourseSatisfiesEdges as jest.Mock;
const mockPrisma = prisma as unknown as {
  studentBadge: { findMany: jest.Mock };
  lessonProgress: { findMany: jest.Mock };
};

// Course copies of three badges in one SATISFIES chain: Sprint earns Run earns Walk.
const BADGES = [
  { id: 'sprint', name: 'Sprint' },
  { id: 'run', name: 'Run' },
  { id: 'walk', name: 'Walk' },
];

function courseBadges(): Map<string, CourseBadge> {
  return new Map(
    BADGES.map((badge) => [
      `${badge.id}-root`,
      { badgeId: badge.id, rootId: `${badge.id}-root`, name: badge.name, lessonIds: [`${badge.id}-lesson`] },
    ])
  );
}

const CHAIN = [
  { fromBadgeId: 'sprint-root', toBadgeId: 'run-root' },
  { fromBadgeId: 'run-root', toBadgeId: 'walk-root' },
];

function exportRequest() {
  return GET(new NextRequest('http://localhost/api/courses/course-1/export?email=prof@example.edu'), {
    params: Promise.resolve({ courseId: 'course-1' }),
  });
}

async function exportedRows() {
  const response = await exportRequest();
  expect(response.status).toBe(200);
  return (await response.json()).rows as Record<string, string>[];
}

describe('GET /api/courses/[courseId]/export earned-via columns (#318)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetchUser.mockResolvedValue({ id: 'prof-1' });
    mockFetchCourse.mockResolvedValue({
      title: 'Chem 101',
      createdById: 'prof-1',
      lessons: BADGES.map((badge) => ({ id: `${badge.id}-lesson`, badgeRequirements: [{ badge }] })),
      enrollments: [
        { role: 'STUDENT', student: { id: 'ada', firstName: 'Ada', lastName: 'A', email: 'ada@x.edu' } },
        { role: 'STUDENT', student: { id: 'ben', firstName: 'Ben', lastName: 'B', email: 'ben@x.edu' } },
      ],
    });
    mockPrisma.lessonProgress.findMany.mockResolvedValue([]);
    mockSatisfies.mockResolvedValue({ courseBadges: courseBadges(), edges: CHAIN });
  });

  it('adds an Earned Via column after each badge another badge can earn', async () => {
    mockPrisma.studentBadge.findMany.mockResolvedValue([]);

    const [row] = await exportedRows();

    expect(Object.keys(row)).toEqual([
      'First Name',
      'Last Name',
      'ID',
      'Email',
      'Sprint',
      'Run',
      'Run – Earned Via',
      'Walk',
      'Walk – Earned Via',
    ]);
  });

  it('shows Self for an own completion and the completed badge for a chained award', async () => {
    mockPrisma.studentBadge.findMany.mockResolvedValue([
      // Ada completed Sprint, which awarded Run, which awarded Walk.
      { studentId: 'ada', badgeId: 'sprint', status: 'COMPLETED', satisfiedByBadgeId: null },
      { studentId: 'ada', badgeId: 'run', status: 'COMPLETED', satisfiedByBadgeId: 'sprint' },
      { studentId: 'ada', badgeId: 'walk', status: 'COMPLETED', satisfiedByBadgeId: 'run' },
      // Ben completed Run on their own and is still learning Walk.
      { studentId: 'ben', badgeId: 'run', status: 'COMPLETED', satisfiedByBadgeId: null },
      { studentId: 'ben', badgeId: 'walk', status: 'LEARNING', satisfiedByBadgeId: null },
    ]);

    const [ada, ben] = await exportedRows();

    expect(ada['Run – Earned Via']).toBe('Sprint');
    expect(ada['Walk – Earned Via']).toBe('Sprint');
    expect(ben['Run – Earned Via']).toBe('Self');
    expect(ben['Walk – Earned Via']).toBe('');
  });

  it('leaves the export unchanged for a course with no earned-through links', async () => {
    mockSatisfies.mockResolvedValue({ courseBadges: courseBadges(), edges: [] });
    mockPrisma.studentBadge.findMany.mockResolvedValue([]);

    const [row] = await exportedRows();

    expect(Object.keys(row)).toEqual(['First Name', 'Last Name', 'ID', 'Email', 'Sprint', 'Run', 'Walk']);
  });
});
