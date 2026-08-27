/** @jest-environment node */

import { currentUser } from '@clerk/nextjs/server';
import { GET } from '../app/qr/assessment/route';
import prisma from '../lib/prisma';

jest.mock('@clerk/nextjs/server', () => ({
  currentUser: jest.fn(),
}));

jest.mock('../lib/prisma', () => {
  const user = { findUnique: jest.fn() };
  const course = { findFirst: jest.fn() };
  return {
    __esModule: true,
    default: { user, course },
  };
});

const mockCurrentUser = currentUser as jest.MockedFunction<typeof currentUser>;
const mockPrisma = prisma as unknown as {
  user: { findUnique: jest.Mock };
  course: { findFirst: jest.Mock };
};
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

function requestFor(params = 'courseId=course-1&studentId=student-1&badgeId=badge-1') {
  return new Request(`http://localhost/qr/assessment?${params}`);
}

function courseWith({
  checkerRole = 'INSTRUCTOR',
  checkerStatus = 'ACTIVE',
  badgeStatus = 'READY_FOR_ASSESSMENT',
  allowCrossSectionView = false,
  checkerSections = ['A1'],
  studentSections = ['A1'],
}: {
  checkerRole?: 'INSTRUCTOR' | 'CHECKER' | 'STUDENT';
  checkerStatus?: 'ACTIVE' | 'PENDING';
  badgeStatus?: string;
  allowCrossSectionView?: boolean;
  checkerSections?: string[];
  studentSections?: string[];
} = {}) {
  return {
    createdById: checkerRole === 'INSTRUCTOR' ? 'checker-1' : 'creator-1',
    settings: { allowCrossSectionView },
    enrollments: [
      {
        role: 'STUDENT',
        status: 'ACTIVE',
        sections: studentSections.map((section) => ({ section })),
        student: {
          id: 'student-1',
          badgeProgress: [{ id: 'sb-1', status: badgeStatus }],
        },
      },
      {
        role: checkerRole,
        status: checkerStatus,
        sections: checkerSections.map((section) => ({ section })),
        student: {
          id: 'checker-1',
          badgeProgress: [],
        },
      },
    ],
  };
}

describe('assessment QR resolver', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearPublicEnv();
    mockCurrentUser.mockResolvedValue({
      id: 'clerk-checker',
      emailAddresses: [{ emailAddress: 'checker@example.edu' }],
    } as Awaited<ReturnType<typeof currentUser>>);
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'checker-1' });
    mockPrisma.course.findFirst.mockResolvedValue(courseWith());
  });

  afterEach(() => {
    restorePublicEnv();
  });

  it('redirects an authorized checker to the assessment page', async () => {
    const res = await GET(requestFor());

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost/assessments/course-1/students/student-1/badges/badge-1');
  });

  it('rejects a checker outside the student section when cross-section view is disabled', async () => {
    mockPrisma.course.findFirst.mockResolvedValue(
      courseWith({ checkerRole: 'CHECKER', checkerSections: ['B1'], studentSections: ['A1'] })
    );

    const res = await GET(requestFor());

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/?assessmentAccess=denied');
  });

  it('redirects a checker in the student section', async () => {
    mockPrisma.course.findFirst.mockResolvedValue(courseWith({ checkerRole: 'CHECKER' }));

    const res = await GET(requestFor());

    expect(res.status).toBe(307);
  });

  it('allows a checker outside the student section when cross-section view is enabled', async () => {
    mockPrisma.course.findFirst.mockResolvedValue(
      courseWith({
        checkerRole: 'CHECKER',
        checkerSections: ['B1'],
        studentSections: ['A1'],
        allowCrossSectionView: true,
      })
    );

    const res = await GET(requestFor());

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost/assessments/course-1/students/student-1/badges/badge-1');
  });

  it('rejects a checker whose checker request is still pending', async () => {
    mockPrisma.course.findFirst.mockResolvedValue(courseWith({ checkerRole: 'CHECKER', checkerStatus: 'PENDING' }));

    const res = await GET(requestFor());

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/?assessmentAccess=denied');
  });

  it('rejects badges that are not ready for assessment', async () => {
    mockPrisma.course.findFirst.mockResolvedValue(courseWith({ badgeStatus: 'LEARNING' }));

    const res = await GET(requestFor());

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/?assessmentAccess=not-ready');
  });

  it('redirects signed-out scanners to sign in with a return target', async () => {
    mockCurrentUser.mockResolvedValue(null);

    const res = await GET(requestFor());

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/sign-in');
    expect(res.headers.get('location')).toContain('redirect_url=');
  });
});
