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
      assessorCode: 'CHECK101',
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
        where: { OR: [{ code: 'CHEM101' }, { assessorCode: 'CHEM101' }] },
      })
    );
    expect(mockEnrollmentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          studentId: 'student-1',
          courseId: 'course-1',
          role: 'STUDENT',
          status: 'ACTIVE',
        },
      })
    );

    const body = await response.json();
    expect(body.course).toEqual(expect.objectContaining({ id: 'course-1', code: 'CHEM101' }));
    expect(body.alreadyEnrolled).toBe(false);
    expect(body.pending).toBeFalsy();
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

  it('rejects joining as a student when already enrolled in a different role', async () => {
    mockCourseFindFirst.mockResolvedValue({
      id: 'course-1',
      title: 'Chemistry 101',
      code: 'CHEM101',
      assessorCode: 'CHECK101',
      createdById: 'instructor-1',
      enrollments: [{ id: 'checker-enrollment', role: 'CHECKER' }],
    });

    const response = await postJoin({ code: 'CHEM101' });

    expect(response.status).toBe(409);
    expect(mockEnrollmentCreate).not.toHaveBeenCalled();

    const body = await response.json();
    expect(body.error).toMatch(/different role/i);
  });

  it('creates a PENDING assessor request (not an immediate enrollment) for the assessor code', async () => {
    mockCourseFindFirst.mockResolvedValue({
      id: 'course-1',
      title: 'Chemistry 101',
      code: 'CHEM101',
      assessorCode: 'CHECK101',
      createdById: 'instructor-1',
      enrollments: [],
    });
    mockEnrollmentCreate.mockResolvedValue({ id: 'enrollment-2', role: 'CHECKER', status: 'PENDING' });

    const response = await postJoin({ code: 'check-101' });

    expect(response.status).toBe(201);
    expect(mockEnrollmentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          studentId: 'student-1',
          courseId: 'course-1',
          role: 'CHECKER',
          status: 'PENDING',
        },
      })
    );

    const body = await response.json();
    expect(body.pending).toBe(true);
    expect(body.alreadyEnrolled).toBe(false);
    expect(body.message).toMatch(/approve|pending|request/i);
  });

  it('reports an already-pending assessor request without creating another', async () => {
    mockCourseFindFirst.mockResolvedValue({
      id: 'course-1',
      title: 'Chemistry 101',
      code: 'CHEM101',
      assessorCode: 'CHECK101',
      createdById: 'instructor-1',
      enrollments: [{ id: 'checker-enrollment', role: 'CHECKER', status: 'PENDING' }],
    });

    const response = await postJoin({ code: 'CHECK101' });

    expect(response.status).toBe(200);
    expect(mockEnrollmentCreate).not.toHaveBeenCalled();

    const body = await response.json();
    expect(body.pending).toBe(true);
    expect(body.alreadyRequested).toBe(true);
  });

  it('returns 404 for an unknown code', async () => {
    mockCourseFindFirst.mockResolvedValue(null);

    const response = await postJoin({ code: 'missing' });

    expect(response.status).toBe(404);
  });
});
