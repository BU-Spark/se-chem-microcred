/** @jest-environment node */

import { GET, HEAD } from '../app/api/qr/route';
import { ensureCurrentUser } from '../app/api/courses/lib/ensure-user';
import { syncLessonBadgesForStudent } from '../lib/badgeProgress';
import prisma from '../lib/prisma';

jest.mock('../app/api/courses/lib/ensure-user', () => ({
  ensureCurrentUser: jest.fn(),
}));

jest.mock('../lib/badgeProgress', () => ({
  syncLessonBadgesForStudent: jest.fn(),
}));

jest.mock('qrcode', () => {
  const toBufferMock = jest.fn(() => Promise.resolve(Buffer.from('qr')));
  return {
    __esModule: true,
    default: { toBuffer: toBufferMock },
    toBuffer: toBufferMock,
  };
});

jest.mock('../lib/prisma', () => {
  const studentBadge = { findUnique: jest.fn() };
  const course = { findFirst: jest.fn() };
  const $transaction = jest.fn(async (callback: (tx: unknown) => unknown) => callback({}));
  return {
    __esModule: true,
    default: { $transaction, studentBadge, course },
  };
});

const buildUrl = (qs: string) => new URL(`http://localhost/api/qr?${qs}`).toString();
const requestLike = (qs: string, ip = '127.0.0.1') => new Request(buildUrl(qs), { headers: { 'x-forwarded-for': ip } });
const expectResponse = (response: Response | undefined): Response => {
  expect(response).toBeDefined();
  return response as Response;
};

const mockEnsureCurrentUser = ensureCurrentUser as jest.MockedFunction<typeof ensureCurrentUser>;
const mockSyncLessonBadgesForStudent = syncLessonBadgesForStudent as jest.MockedFunction<
  typeof syncLessonBadgesForStudent
>;
const mockPrisma = prisma as unknown as {
  $transaction: jest.Mock;
  studentBadge: { findUnique: jest.Mock };
  course: { findFirst: jest.Mock };
};

describe('QR API', () => {
  const studentId = 'student-123';
  const badgeId = 'badge-abc';
  const payload = `student:${studentId}|badge:${badgeId}`;

  beforeEach(() => {
    jest.clearAllMocks();
    const store = (globalThis as { __qrRateLimit?: Map<string, unknown> }).__qrRateLimit;
    store?.clear?.();
    mockEnsureCurrentUser.mockResolvedValue({
      id: studentId,
      email: 'student@example.edu',
      name: 'Student Example',
      buid: null,
      avatar: null,
    });
    mockSyncLessonBadgesForStudent.mockResolvedValue({ readyForAssessment: false });
    mockPrisma.studentBadge.findUnique.mockResolvedValue({ id: 'student-badge-1', status: 'READY_FOR_ASSESSMENT' });
    mockPrisma.course.findFirst.mockResolvedValue({ id: 'course-1', lessons: [{ id: 'lesson-1' }] });
  });

  it('returns a PNG with content length when user owns the badge', async () => {
    const res = expectResponse(await GET(requestLike(`data=${encodeURIComponent(payload)}&size=180`)));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');

    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.byteLength).toBeGreaterThan(0);
    expect(res.headers.get('content-length')).toBe(String(buf.byteLength));
  });

  it('allows QR generation for an internal assessment resolver URL', async () => {
    const assessmentUrl = `http://localhost/qr/assessment?courseId=course-1&studentId=${studentId}&badgeId=${badgeId}`;
    const res = expectResponse(await GET(requestLike(`data=${encodeURIComponent(assessmentUrl)}&size=180`)));

    expect(res.status).toBe(200);
    expect(mockPrisma.course.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'course-1',
        }),
      })
    );
    expect(mockSyncLessonBadgesForStudent).toHaveBeenCalledWith(expect.anything(), {
      studentId,
      lessonId: 'lesson-1',
    });
  });

  it('allows production assessment URLs when the server receives an internal proxy host', async () => {
    const assessmentUrl = `https://spark-microcred-production.up.railway.app/qr/assessment?courseId=course-1&studentId=${studentId}&badgeId=${badgeId}`;
    const request = new Request(`http://localhost:8080/api/qr?data=${encodeURIComponent(assessmentUrl)}&size=180`, {
      headers: {
        host: 'localhost:8080',
        'x-forwarded-host': 'spark-microcred-production.up.railway.app',
        'x-forwarded-proto': 'https',
        'x-forwarded-for': '127.0.0.3',
      },
    });

    const res = expectResponse(await GET(request));

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
  });

  it('rejects assessment QR generation when the badge is not ready for assessment', async () => {
    mockPrisma.studentBadge.findUnique.mockResolvedValue({ id: 'student-badge-1', status: 'LEARNING' });
    const assessmentUrl = `http://localhost/qr/assessment?courseId=course-1&studentId=${studentId}&badgeId=${badgeId}`;
    const res = expectResponse(await GET(requestLike(`data=${encodeURIComponent(assessmentUrl)}`)));

    expect(res.status).toBe(409);
  });

  it('handles HEAD requests with correct headers', async () => {
    const res = expectResponse(await HEAD(requestLike(`data=${encodeURIComponent(payload)}&size=180`, '127.0.0.2')));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('content-length')).toBeNull();
    const body = await res.arrayBuffer();
    expect(body.byteLength).toBe(0);
  });

  it('returns 401 when not authenticated', async () => {
    mockEnsureCurrentUser.mockResolvedValue(null);
    const res = expectResponse(await GET(requestLike(`data=${encodeURIComponent(payload)}`)));
    expect(res.status).toBe(401);
  });

  it('rejects QR generation for a different student', async () => {
    mockEnsureCurrentUser.mockResolvedValue({
      id: 'other-student',
      email: 'other@example.edu',
      name: 'Other Student',
      buid: null,
      avatar: null,
    });
    const res = expectResponse(await GET(requestLike(`data=${encodeURIComponent(payload)}`)));
    expect(res.status).toBe(403);
  });

  it('rejects QR generation when badge is not owned', async () => {
    mockPrisma.studentBadge.findUnique.mockResolvedValue(null);
    const res = expectResponse(await GET(requestLike(`data=${encodeURIComponent(payload)}`)));
    expect(res.status).toBe(403);
  });

  it('returns 400 for invalid payload format', async () => {
    const res = expectResponse(await GET(requestLike('data=just-text')));
    expect(res.status).toBe(400);
  });

  it('enforces rate limiting per IP', async () => {
    const ip = '192.168.0.10';
    // First 30 requests should be allowed
    for (let i = 0; i < 30; i += 1) {
      const res = expectResponse(await GET(requestLike(`data=${encodeURIComponent(payload)}`, ip)));
      expect(res.status).toBe(200);
    }
    // 31st request should be blocked
    const blocked = expectResponse(await GET(requestLike(`data=${encodeURIComponent(payload)}`, ip)));
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('retry-after')).not.toBeNull();
  });
});
