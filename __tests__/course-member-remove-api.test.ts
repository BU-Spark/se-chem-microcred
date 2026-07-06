/** @jest-environment node */

import { NextRequest } from 'next/server';

const mockEnsureCurrentUser = jest.fn();
const mockCourseFindFirst = jest.fn();
const mockEnrollmentFindFirst = jest.fn();
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
      delete: (...args: unknown[]) => mockEnrollmentDelete(...args),
    },
  },
}));

function buildRequest() {
  return new NextRequest('http://localhost/api/courses/course-1/students/student-1', { method: 'DELETE' });
}

async function callDelete(courseId = 'course-1', studentId = 'student-1') {
  const route = await import('../app/api/courses/[courseId]/students/[studentId]/route');
  return (await route.DELETE(buildRequest(), {
    params: Promise.resolve({ courseId, studentId }),
  })) as Response;
}

describe('remove student from course API (DELETE)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEnsureCurrentUser.mockResolvedValue({ id: 'instructor-1', email: 'prof@example.edu' });
    mockCourseFindFirst.mockResolvedValue({ id: 'course-1' });
    mockEnrollmentFindFirst.mockResolvedValue({ id: 'enr-student-1' });
    mockEnrollmentDelete.mockResolvedValue({ id: 'enr-student-1' });
  });

  it('removes an enrolled student when the instructor owns the course', async () => {
    const response = await callDelete();

    expect(response.status).toBe(200);
    expect(mockCourseFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'course-1', createdById: 'instructor-1' } })
    );
    expect(mockEnrollmentFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ courseId: 'course-1', studentId: 'student-1', role: 'STUDENT' }),
      })
    );
    expect(mockEnrollmentDelete).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'enr-student-1' } }));
  });

  it('returns 401 when there is no signed-in user', async () => {
    mockEnsureCurrentUser.mockResolvedValue(null);

    const response = await callDelete();

    expect(response.status).toBe(401);
    expect(mockEnrollmentDelete).not.toHaveBeenCalled();
  });

  it('returns 404 when the signed-in user does not own the course', async () => {
    mockCourseFindFirst.mockResolvedValue(null);

    const response = await callDelete();

    expect(response.status).toBe(404);
    expect(mockEnrollmentFindFirst).not.toHaveBeenCalled();
    expect(mockEnrollmentDelete).not.toHaveBeenCalled();
  });

  it('returns 404 when the target is not an enrolled student', async () => {
    mockEnrollmentFindFirst.mockResolvedValue(null);

    const response = await callDelete();

    expect(response.status).toBe(404);
    expect(mockEnrollmentDelete).not.toHaveBeenCalled();
  });
});
