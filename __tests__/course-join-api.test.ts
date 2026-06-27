/** @jest-environment node */

import { NextRequest } from 'next/server';

const mockEnsureCurrentUser = jest.fn();
const mockCourseFindFirst = jest.fn();
const mockEnrollmentCreate = jest.fn();

jest.mock(
  '@/app/api/courses/lib/ensure-user',
  () => ({
    ensureCurrentUser: (...args: unknown[]) => mockEnsureCurrentUser(...args),
  }),
  { virtual: true }
);

jest.mock('../app/api/courses/lib/ensure-user', () => ({
  ensureCurrentUser: (...args: unknown[]) => mockEnsureCurrentUser(...args),
}));

jest.mock('../lib/prisma', () => {
  return {
    __esModule: true,
    default: {
      course: { findFirst: (...args: unknown[]) => mockCourseFindFirst(...args) },
      enrollment: { create: (...args: unknown[]) => mockEnrollmentCreate(...args) },
    },
  };
});

function buildRequest(body: unknown) {
  return new NextRequest('http://localhost/api/courses/join', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

async function postJoin(body: unknown) {
  const { POST } = await import('../app/api/courses/join/route');
  return (await POST(buildRequest(body))) as Response;
}

describe('course join API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEnsureCurrentUser.mockResolvedValue({ id: 'student-1', email: 'student@example.edu' });
    mockCourseFindFirst.mockResolvedValue({
      id: 'course-1',
      title: 'Chemistry 101',
      code: 'CHEM101',
      createdById: 'instructor-1',
      enrollments: [],
    });
    mockEnrollmentCreate.mockResolvedValue({
      id: 'enrollment-1',
      role: 'STUDENT',
    });
  });

  it('enrolls the signed-in user by normalized course code', async () => {
    const response = await postJoin({ code: 'chem-101' });

    expect(response.status).toBe(201);
    expect(mockCourseFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { code: 'CHEM101' },
      })
    );
    expect(mockEnrollmentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          studentId: 'student-1',
          courseId: 'course-1',
          role: 'STUDENT',
        },
      })
    );

    const body = await response.json();
    expect(body.course).toEqual(expect.objectContaining({ id: 'course-1', code: 'CHEM101' }));
    expect(body.alreadyEnrolled).toBe(false);
  });

  it('returns the existing enrollment without creating a duplicate', async () => {
    mockCourseFindFirst.mockResolvedValue({
      id: 'course-1',
      title: 'Chemistry 101',
      code: 'CHEM101',
      createdById: 'instructor-1',
      enrollments: [{ id: 'enrollment-existing', role: 'STUDENT' }],
    });

    const response = await postJoin({ code: 'CHEM101' });

    expect(response.status).toBe(200);
    expect(mockEnrollmentCreate).not.toHaveBeenCalled();

    const body = await response.json();
    expect(body.alreadyEnrolled).toBe(true);
  });

  it('rejects the course owner instead of treating the instructor enrollment as a student join', async () => {
    mockEnsureCurrentUser.mockResolvedValue({ id: 'instructor-1', email: 'instructor@example.edu' });
    mockCourseFindFirst.mockResolvedValue({
      id: 'course-1',
      title: 'Chemistry 101',
      code: 'CHEM101',
      createdById: 'instructor-1',
      enrollments: [{ id: 'creator-enrollment', role: 'INSTRUCTOR' }],
    });

    const response = await postJoin({ code: 'CHEM101' });

    expect(response.status).toBe(409);
    expect(mockEnrollmentCreate).not.toHaveBeenCalled();

    const body = await response.json();
    expect(body.error).toMatch(/already own/i);
  });

  it('rejects existing course staff instead of adding a student enrollment', async () => {
    mockCourseFindFirst.mockResolvedValue({
      id: 'course-1',
      title: 'Chemistry 101',
      code: 'CHEM101',
      createdById: 'instructor-1',
      enrollments: [{ id: 'checker-enrollment', role: 'CHECKER' }],
    });

    const response = await postJoin({ code: 'CHEM101' });

    expect(response.status).toBe(409);
    expect(mockEnrollmentCreate).not.toHaveBeenCalled();

    const body = await response.json();
    expect(body.error).toMatch(/staff role/i);
  });

  it('returns 404 for an unknown code', async () => {
    mockCourseFindFirst.mockResolvedValue(null);

    const response = await postJoin({ code: 'missing' });

    expect(response.status).toBe(404);
  });
});
