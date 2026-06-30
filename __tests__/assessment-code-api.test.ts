/** @jest-environment node */

import { currentUser } from '@clerk/nextjs/server';

import { POST } from '../app/api/assessment-codes/route';
import { GET } from '../app/qr/assessment-code/route';
import prisma from '../lib/prisma';

jest.mock('@clerk/nextjs/server', () => ({
  currentUser: jest.fn(),
}));

jest.mock('../lib/prisma', () => {
  const user = { findUnique: jest.fn() };
  const studentBadge = { findUnique: jest.fn() };
  const course = { findFirst: jest.fn() };
  const assessmentAccessCode = {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  };
  return {
    __esModule: true,
    default: { user, studentBadge, course, assessmentAccessCode },
  };
});

const mockCurrentUser = currentUser as jest.MockedFunction<typeof currentUser>;
const mockPrisma = prisma as unknown as {
  user: { findUnique: jest.Mock };
  studentBadge: { findUnique: jest.Mock };
  course: { findFirst: jest.Mock };
  assessmentAccessCode: {
    findFirst: jest.Mock;
    findUnique: jest.Mock;
    create: jest.Mock;
    delete: jest.Mock;
    deleteMany: jest.Mock;
  };
};

function postRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/assessment-codes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as Parameters<typeof POST>[0];
}

describe('Assessment access codes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCurrentUser.mockResolvedValue({
      id: 'clerk-1',
      emailAddresses: [{ emailAddress: 'student@example.edu' }],
    } as Awaited<ReturnType<typeof currentUser>>);
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'student-1' });
    mockPrisma.studentBadge.findUnique.mockResolvedValue({ status: 'READY_FOR_ASSESSMENT' });
    mockPrisma.course.findFirst.mockResolvedValue({ id: 'course-1' });
    mockPrisma.assessmentAccessCode.findFirst.mockResolvedValue(null);
    mockPrisma.assessmentAccessCode.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.assessmentAccessCode.create.mockImplementation(({ data }) =>
      Promise.resolve({
        id: 'access-code-1',
        ...data,
      })
    );
  });

  it('creates a reusable short code for a ready badge assessment', async () => {
    const response = await POST(postRequest({ courseId: 'course-1', badgeId: 'badge-1' }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(mockPrisma.studentBadge.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { studentId_badgeId: { studentId: 'student-1', badgeId: 'badge-1' } },
      })
    );
    expect(mockPrisma.course.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'course-1',
          enrollments: { some: { studentId: 'student-1' } },
        }),
      })
    );
  });

  it('reuses an unexpired code for the same student, course, and badge', async () => {
    const expiresAt = new Date(Date.now() + 60_000);
    mockPrisma.assessmentAccessCode.findFirst.mockResolvedValue({
      code: 'ABCD2345',
      expiresAt,
    });

    const response = await POST(postRequest({ courseId: 'course-1', badgeId: 'badge-1' }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.code).toBe('ABCD-2345');
    expect(mockPrisma.assessmentAccessCode.create).not.toHaveBeenCalled();
  });

  it('rejects codes for badges that are not ready for assessment', async () => {
    mockPrisma.studentBadge.findUnique.mockResolvedValue({ status: 'LEARNING' });

    const response = await POST(postRequest({ courseId: 'course-1', badgeId: 'badge-1' }));

    expect(response.status).toBe(409);
    expect(mockPrisma.assessmentAccessCode.create).not.toHaveBeenCalled();
  });

  it('redirects a typed code to the existing assessment route', async () => {
    mockPrisma.assessmentAccessCode.findUnique.mockResolvedValue({
      id: 'access-code-1',
      code: 'ABCD2345',
      courseId: 'course-1',
      studentId: 'student-1',
      badgeId: 'badge-1',
      expiresAt: new Date(Date.now() + 60_000),
    });

    const response = await GET(new Request('http://localhost/qr/assessment-code?code=abcd-2345'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost/qr/assessment?courseId=course-1&studentId=student-1&badgeId=badge-1'
    );
    expect(mockPrisma.assessmentAccessCode.findUnique).toHaveBeenCalledWith({ where: { code: 'ABCD2345' } });
  });

  it('redirects expired typed codes to the home notice', async () => {
    mockPrisma.assessmentAccessCode.findUnique.mockResolvedValue({
      id: 'access-code-1',
      code: 'ABCD2345',
      courseId: 'course-1',
      studentId: 'student-1',
      badgeId: 'badge-1',
      expiresAt: new Date(Date.now() - 60_000),
    });
    mockPrisma.assessmentAccessCode.delete.mockResolvedValue({});

    const response = await GET(new Request('http://localhost/qr/assessment-code?code=ABCD-2345'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('/?assessmentAccess=invalid');
    expect(mockPrisma.assessmentAccessCode.delete).toHaveBeenCalledWith({ where: { id: 'access-code-1' } });
  });
});
