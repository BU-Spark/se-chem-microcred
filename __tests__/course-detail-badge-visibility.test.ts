/** @jest-environment node */

import { NextRequest } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';

import { GET } from '../app/api/courses/[courseId]/route';
import { fetchAccessibleCourseDetail, fetchUserByEmail } from '../app/api/courses/lib/course-queries';

jest.mock('@clerk/nextjs/server', () => ({ currentUser: jest.fn() }));

jest.mock('../app/api/courses/lib/course-queries', () => ({
  fetchAccessibleCourseDetail: jest.fn(),
  fetchUserByEmail: jest.fn(),
}));

// contacts is empty in the fixture, so the route never queries prisma for
// contact avatars — but mock it defensively so an accidental call can't hit a DB.
jest.mock('../lib/prisma', () => ({
  __esModule: true,
  default: { user: { findMany: jest.fn().mockResolvedValue([]) } },
}));

const mockCurrentUser = currentUser as jest.MockedFunction<typeof currentUser>;
const mockFetchDetail = fetchAccessibleCourseDetail as jest.MockedFunction<typeof fetchAccessibleCourseDetail>;
const mockFetchUser = fetchUserByEmail as jest.MockedFunction<typeof fetchUserByEmail>;

const DAY = 24 * 60 * 60 * 1000;
const FUTURE = new Date(Date.now() + 7 * DAY);
const PAST = new Date(Date.now() - 7 * DAY);

function badgeReq(id: string, availableOn: Date | null) {
  return {
    id: `req-${id}`,
    summary: null,
    badge: { id, slug: id, name: id, description: null, availableOn, closesOn: null, neverCloses: true },
  };
}

// One lesson carrying a released badge and a not-yet-released badge.
function courseFixture(createdById: string) {
  return {
    id: 'course-1',
    title: 'Chem101',
    createdById,
    settings: null,
    createdBy: { id: 'prof-1', name: 'Prof', email: 'prof@example.edu', buid: 'P1', avatar: null },
    contacts: [],
    enrollments: [
      {
        id: 'enr-1',
        role: 'STUDENT',
        status: 'ACTIVE',
        sections: [],
        student: { id: 'student-1', name: 'Stu', email: 'stu@example.edu', buid: 'S1' },
      },
    ],
    lessons: [
      {
        id: 'lesson-1',
        slug: 'l1',
        title: 'Lesson 1',
        summary: '',
        thumbnailUrl: null,
        sortOrder: 0,
        segments: [],
        badgeRequirements: [badgeReq('released', PAST), badgeReq('future', FUTURE)],
      },
    ],
  };
}

function request() {
  return new NextRequest('http://localhost/api/courses/course-1');
}
function ctx() {
  return { params: Promise.resolve({ courseId: 'course-1' }) };
}

function badgeIds(payload: { course: { lessons: Array<{ badgeRequirements: Array<{ badge: { id: string } }> }> } }) {
  return payload.course.lessons.flatMap((lesson) => lesson.badgeRequirements.map((req) => req.badge.id));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCurrentUser.mockResolvedValue({
    emailAddresses: [{ emailAddress: 'stu@example.edu' }],
  } as Awaited<ReturnType<typeof currentUser>>);
});

describe('GET /api/courses/[courseId] badge visibility', () => {
  it('hides not-yet-released badges from a student viewer', async () => {
    // Student viewer: not the creator, enrolled as STUDENT.
    mockFetchUser.mockResolvedValue({ id: 'student-1' } as Awaited<ReturnType<typeof fetchUserByEmail>>);
    mockFetchDetail.mockResolvedValue(
      courseFixture('prof-1') as unknown as Awaited<ReturnType<typeof fetchAccessibleCourseDetail>>
    );

    const response = await GET(request(), ctx());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.viewerRole).toBe('STUDENT');
    expect(badgeIds(payload)).toEqual(['released']);
  });

  it('shows all badges to the instructor (course creator)', async () => {
    // Creator viewer: user id matches createdById → INSTRUCTOR, no filtering.
    mockFetchUser.mockResolvedValue({ id: 'prof-1' } as Awaited<ReturnType<typeof fetchUserByEmail>>);
    mockFetchDetail.mockResolvedValue(
      courseFixture('prof-1') as unknown as Awaited<ReturnType<typeof fetchAccessibleCourseDetail>>
    );

    const response = await GET(request(), ctx());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.viewerRole).toBe('INSTRUCTOR');
    expect(badgeIds(payload).sort()).toEqual(['future', 'released']);
  });
});
