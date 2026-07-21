/** @jest-environment node */

import { POST } from '../app/api/assessment-codes/route';
import { GET } from '../app/qr/assessment-code/route';
import { ensureCurrentUser } from '../app/api/courses/lib/ensure-user';
import { syncLessonBadgesForStudent } from '../lib/badgeProgress';
import prisma from '../lib/prisma';

jest.mock('../app/api/courses/lib/ensure-user', () => ({
  ensureCurrentUser: jest.fn(),
}));

jest.mock('../lib/badgeProgress', () => ({
  syncLessonBadgesForStudent: jest.fn(),
}));

jest.mock('../lib/prisma', () => {
  const studentBadge = { findUnique: jest.fn() };
  const course = { findFirst: jest.fn() };
  const assessmentAccessCode = {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  };
  const $transaction = jest.fn(async (callback: (tx: unknown) => unknown) => callback({}));
  return {
    __esModule: true,
    default: { $transaction, studentBadge, course, assessmentAccessCode },
  };
});

const mockEnsureCurrentUser = ensureCurrentUser as jest.MockedFunction<typeof ensureCurrentUser>;
const mockSyncLessonBadgesForStudent = syncLessonBadgesForStudent as jest.MockedFunction<
  typeof syncLessonBadgesForStudent
>;
const mockPrisma = prisma as unknown as {
  $transaction: jest.Mock;
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
const TEST_PUBLIC_ORIGIN = 'https://spark-microcred.example';
const TEST_PUBLIC_HOST = new URL(TEST_PUBLIC_ORIGIN).host;
const originalPublicEnv = {
  APP_URL: process.env.APP_URL,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  RAILWAY_PUBLIC_DOMAIN: process.env.RAILWAY_PUBLIC_DOMAIN,
};

function restorePublicEnv() {
  for (const [key, value] of Object.entries(originalPublicEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function clearPublicEnv() {
  delete process.env.APP_URL;
  delete process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.RAILWAY_PUBLIC_DOMAIN;
}

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
    clearPublicEnv();
    mockEnsureCurrentUser.mockResolvedValue({
      id: 'student-1',
      email: 'student@example.edu',
      name: 'Student Example',
      externalId: null,
      avatar: null,
    });
    mockSyncLessonBadgesForStudent.mockResolvedValue({ readyForAssessment: false });
    mockPrisma.studentBadge.findUnique.mockResolvedValue({ status: 'READY_FOR_ASSESSMENT' });
    mockPrisma.course.findFirst.mockResolvedValue({ id: 'course-1', lessons: [{ id: 'lesson-1' }] });
    mockPrisma.assessmentAccessCode.findFirst.mockResolvedValue(null);
    mockPrisma.assessmentAccessCode.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.assessmentAccessCode.create.mockImplementation(({ data }) =>
      Promise.resolve({
        id: 'access-code-1',
        ...data,
      })
    );
  });

  afterEach(() => {
    restorePublicEnv();
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
    expect(mockSyncLessonBadgesForStudent).toHaveBeenCalledWith(expect.anything(), {
      studentId: 'student-1',
      lessonId: 'lesson-1',
    });
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

  it('syncs lesson badge progress before deciding readiness', async () => {
    mockPrisma.course.findFirst.mockResolvedValue({
      id: 'course-1',
      lessons: [{ id: 'lesson-1' }, { id: 'lesson-2' }],
    });
    mockPrisma.studentBadge.findUnique.mockResolvedValue({ status: 'READY_FOR_ASSESSMENT' });

    const response = await POST(postRequest({ courseId: 'course-1', badgeId: 'badge-1' }));

    expect(response.status).toBe(200);
    expect(mockSyncLessonBadgesForStudent).toHaveBeenCalledTimes(2);
    expect(mockSyncLessonBadgesForStudent).toHaveBeenNthCalledWith(1, expect.anything(), {
      studentId: 'student-1',
      lessonId: 'lesson-1',
    });
    expect(mockSyncLessonBadgesForStudent).toHaveBeenNthCalledWith(2, expect.anything(), {
      studentId: 'student-1',
      lessonId: 'lesson-2',
    });
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

  it('uses forwarded public host when redirecting typed codes', async () => {
    mockPrisma.assessmentAccessCode.findUnique.mockResolvedValue({
      id: 'access-code-1',
      code: 'ABCD2345',
      courseId: 'course-1',
      studentId: 'student-1',
      badgeId: 'badge-1',
      expiresAt: new Date(Date.now() + 60_000),
    });

    const response = await GET(
      new Request('http://localhost/qr/assessment-code?code=abcd-2345', {
        headers: {
          'x-forwarded-host': TEST_PUBLIC_HOST,
          'x-forwarded-proto': 'https',
        },
      })
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      `${TEST_PUBLIC_ORIGIN}/qr/assessment?courseId=course-1&studentId=student-1&badgeId=badge-1`
    );
  });

  it('uses the configured app URL instead of an internal localhost host when redirecting typed codes', async () => {
    process.env.APP_URL = TEST_PUBLIC_ORIGIN;
    mockPrisma.assessmentAccessCode.findUnique.mockResolvedValue({
      id: 'access-code-1',
      code: 'ABCD2345',
      courseId: 'course-1',
      studentId: 'student-1',
      badgeId: 'badge-1',
      expiresAt: new Date(Date.now() + 60_000),
    });

    const response = await GET(
      new Request('http://localhost:8080/qr/assessment-code?code=abcd-2345', {
        headers: {
          host: 'localhost:8080',
        },
      })
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      `${TEST_PUBLIC_ORIGIN}/qr/assessment?courseId=course-1&studentId=student-1&badgeId=badge-1`
    );
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
