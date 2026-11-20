/** @jest-environment node */
// Issue #328: integration test for GET /api/courses/[courseId]/last-active. The real
// route, enrollment query and Clerk lookup run together; only Prisma, Clerk and the
// signed-in user are mocked at the edge.

import { NextRequest } from 'next/server';
import { clerkClient } from '@clerk/nextjs/server';

import { GET } from '../app/api/courses/[courseId]/last-active/route';
import { ensureCurrentUser } from '../app/api/courses/lib/ensure-user';
import { prisma } from '../lib/prisma';

jest.mock('../lib/prisma', () => {
  const prisma = {
    course: { findUnique: jest.fn() },
    enrollment: { findMany: jest.fn() },
  };
  return { __esModule: true, default: prisma, prisma };
});

jest.mock('../app/api/courses/lib/ensure-user', () => ({ ensureCurrentUser: jest.fn() }));

const mockGetUserList = jest.fn();
jest.mock('@clerk/nextjs/server', () => ({
  clerkClient: jest.fn(),
  currentUser: jest.fn(),
}));

const mockEnsureCurrentUser = ensureCurrentUser as jest.MockedFunction<typeof ensureCurrentUser>;
const mockClerkClient = clerkClient as unknown as jest.Mock;
const mockFindCourse = prisma.course.findUnique as unknown as jest.Mock;
const mockFindEnrollments = prisma.enrollment.findMany as unknown as jest.Mock;

const INSTRUCTOR = { id: 'prof-1', email: 'prof@example.edu' } as Awaited<ReturnType<typeof ensureCurrentUser>>;
const ADA_ACTIVE = Date.parse('2026-11-19T15:30:00.000Z');

function request() {
  return new NextRequest('http://localhost/api/courses/course-1/last-active');
}

function context(courseId = 'course-1') {
  return { params: Promise.resolve({ courseId }) };
}

function enrollment(studentId: string, email: string) {
  return { studentId, student: { email } };
}

function clerkUser(lastActiveAt: number | null, ...emails: string[]) {
  return { lastActiveAt, emailAddresses: emails.map((emailAddress) => ({ emailAddress })) };
}

describe('GET /api/courses/[courseId]/last-active', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockClerkClient.mockResolvedValue({ users: { getUserList: mockGetUserList } });
    mockEnsureCurrentUser.mockResolvedValue(INSTRUCTOR);
    mockFindCourse.mockResolvedValue({ createdById: 'prof-1' });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('joins roster emails to Clerk users and returns last-active times keyed by student id', async () => {
    mockFindEnrollments.mockResolvedValue([
      enrollment('student-1', 'Ada@BU.edu'),
      enrollment('student-2', 'grace@bu.edu'),
      enrollment('student-3', 'alan@bu.edu'),
    ]);
    mockGetUserList.mockResolvedValue({
      data: [
        // Ada's roster email is a secondary Clerk address, in a different case.
        clerkUser(ADA_ACTIVE, 'ada.personal@gmail.com', 'ada@bu.edu'),
        // Grace exists in Clerk but has never been active.
        clerkUser(null, 'GRACE@bu.edu'),
        // Alan has no Clerk user at all.
      ],
      totalCount: 2,
    });

    const response = await GET(request(), context());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.lastActive).toEqual({
      'student-1': new Date(ADA_ACTIVE).toISOString(),
      'student-2': null,
      'student-3': null,
    });
    expect(Date.parse(body.fetchedAt)).not.toBeNaN();

    // The query is the narrow Enrollment JOIN Student for active students with emails.
    expect(mockFindEnrollments).toHaveBeenCalledWith({
      where: { courseId: 'course-1', role: 'STUDENT', status: 'ACTIVE', student: { email: { not: null } } },
      select: { studentId: true, student: { select: { email: true } } },
    });
    // One batched Clerk call with normalized emails.
    expect(mockGetUserList).toHaveBeenCalledTimes(1);
    expect(mockGetUserList).toHaveBeenCalledWith({
      emailAddress: ['ada@bu.edu', 'grace@bu.edu', 'alan@bu.edu'],
      limit: 500,
    });
  });

  it.each([
    { size: 250, chunks: [100, 100, 50] },
    { size: 500, chunks: [100, 100, 100, 100, 100] },
    { size: 1000, chunks: Array(10).fill(100) },
  ])('handles a $size-student roster in $chunks.length Clerk requests', async ({ size, chunks }) => {
    const students = Array.from({ length: size }, (_, i) => enrollment(`student-${i}`, `s${i}@bu.edu`));
    mockFindEnrollments.mockResolvedValue(students);
    // Clerk answers each chunk with its matching users. Every third student has never
    // been active, and every fifth has no Clerk account at all.
    const activeAt = (i: number) => ADA_ACTIVE + i * 60_000;
    mockGetUserList.mockImplementation(async ({ emailAddress }: { emailAddress: string[] }) => ({
      data: emailAddress
        .map((email) => Number(email.slice(1, email.indexOf('@'))))
        .filter((i) => i % 5 !== 0)
        .map((i) => clerkUser(i % 3 === 0 ? null : activeAt(i), `s${i}@bu.edu`)),
      totalCount: emailAddress.length,
    }));

    const response = await GET(request(), context());
    const body = await response.json();

    expect(response.status).toBe(200);
    // Batched, never one call per student, and each email is sent exactly once.
    expect(mockGetUserList.mock.calls.map(([params]) => params.emailAddress.length)).toEqual(chunks);
    const sent = mockGetUserList.mock.calls.flatMap(([params]) => params.emailAddress);
    expect(new Set(sent).size).toBe(size);
    // The roster is queried once regardless of size.
    expect(mockFindEnrollments).toHaveBeenCalledTimes(1);

    // Every student gets an entry, merged back to the right row across chunk boundaries.
    expect(Object.keys(body.lastActive)).toHaveLength(size);
    for (let i = 0; i < size; i += 1) {
      const expected = i % 5 === 0 || i % 3 === 0 ? null : new Date(activeAt(i)).toISOString();
      expect(body.lastActive[`student-${i}`]).toBe(expected);
    }
  });

  it('skips Clerk entirely for an empty roster', async () => {
    mockFindEnrollments.mockResolvedValue([]);

    const response = await GET(request(), context());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(expect.objectContaining({ lastActive: {} }));
    expect(mockClerkClient).not.toHaveBeenCalled();
  });

  it('returns 401 when nobody is signed in', async () => {
    mockEnsureCurrentUser.mockResolvedValue(null);

    const response = await GET(request(), context());

    expect(response.status).toBe(401);
    expect(mockFindEnrollments).not.toHaveBeenCalled();
  });

  it('returns 404 for an unknown course', async () => {
    mockFindCourse.mockResolvedValue(null);

    const response = await GET(request(), context());

    expect(response.status).toBe(404);
    expect(mockFindEnrollments).not.toHaveBeenCalled();
  });

  it('returns 403 to anyone but the course instructor, so students never see classmates', async () => {
    mockEnsureCurrentUser.mockResolvedValue({ ...INSTRUCTOR!, id: 'student-1' });

    const response = await GET(request(), context());

    expect(response.status).toBe(403);
    expect(mockFindEnrollments).not.toHaveBeenCalled();
    expect(mockGetUserList).not.toHaveBeenCalled();
  });

  it('returns 502 when Clerk fails', async () => {
    mockFindEnrollments.mockResolvedValue([enrollment('student-1', 'ada@bu.edu')]);
    mockGetUserList.mockRejectedValue(new Error('Clerk is down'));

    const response = await GET(request(), context());

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'Unable to load last-active times.' });
  });
});
