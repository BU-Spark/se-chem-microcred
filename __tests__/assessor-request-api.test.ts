/** @jest-environment node */

import { NextRequest } from 'next/server';

const mockEnsureCurrentUser = jest.fn();
const mockCourseFindFirst = jest.fn();
const mockEnrollmentFindFirst = jest.fn();
const mockEnrollmentUpdate = jest.fn();
const mockEnrollmentDelete = jest.fn();

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

jest.mock('../lib/prisma', () => ({
  __esModule: true,
  default: {
    course: { findFirst: (...args: unknown[]) => mockCourseFindFirst(...args) },
    enrollment: {
      findFirst: (...args: unknown[]) => mockEnrollmentFindFirst(...args),
      update: (...args: unknown[]) => mockEnrollmentUpdate(...args),
      delete: (...args: unknown[]) => mockEnrollmentDelete(...args),
    },
  },
}));

function buildRequest(method: string) {
  return new NextRequest('http://localhost/api/courses/course-1/enrollments/enr-1', { method });
}

async function callRoute(method: 'PATCH' | 'DELETE', courseId = 'course-1', enrollmentId = 'enr-1') {
  const route = await import('../app/api/courses/[courseId]/enrollments/[enrollmentId]/route');
  const handler = method === 'PATCH' ? route.PATCH : route.DELETE;
  return (await handler(buildRequest(method), {
    params: Promise.resolve({ courseId, enrollmentId }),
  })) as Response;
}

describe('assessor request approve/decline API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEnsureCurrentUser.mockResolvedValue({ id: 'instructor-1', email: 'prof@example.edu' });
    mockCourseFindFirst.mockResolvedValue({ id: 'course-1' });
    mockEnrollmentFindFirst.mockResolvedValue({ id: 'enr-1' });
    mockEnrollmentUpdate.mockResolvedValue({ id: 'enr-1', role: 'CHECKER', status: 'ACTIVE' });
    mockEnrollmentDelete.mockResolvedValue({ id: 'enr-1' });
  });

  it('approves a pending assessor (PATCH -> status ACTIVE)', async () => {
    const response = await callRoute('PATCH');

    expect(response.status).toBe(200);
    expect(mockEnrollmentFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'enr-1', courseId: 'course-1', role: 'CHECKER', status: 'PENDING' }),
      })
    );
    expect(mockEnrollmentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'enr-1' }, data: { status: 'ACTIVE' } })
    );
    expect(mockEnrollmentDelete).not.toHaveBeenCalled();
  });

  it('declines a pending assessor (DELETE -> removes the row)', async () => {
    const response = await callRoute('DELETE');

    expect(response.status).toBe(200);
    expect(mockEnrollmentDelete).toHaveBeenCalledWith({ where: { id: 'enr-1' } });
    expect(mockEnrollmentUpdate).not.toHaveBeenCalled();
  });

  it('rejects a non-instructor (course not owned) with 404 and no mutation', async () => {
    mockCourseFindFirst.mockResolvedValue(null);

    const response = await callRoute('PATCH');

    expect(response.status).toBe(404);
    expect(mockEnrollmentUpdate).not.toHaveBeenCalled();
  });

  it('returns 404 when there is no matching pending request', async () => {
    mockEnrollmentFindFirst.mockResolvedValue(null);

    const response = await callRoute('PATCH');

    expect(response.status).toBe(404);
    expect(mockEnrollmentUpdate).not.toHaveBeenCalled();
  });

  it('returns 401 when not signed in', async () => {
    mockEnsureCurrentUser.mockResolvedValue(null);

    const response = await callRoute('DELETE');

    expect(response.status).toBe(401);
    expect(mockEnrollmentDelete).not.toHaveBeenCalled();
  });
});
