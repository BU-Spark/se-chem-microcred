/** @jest-environment node */

import { GET, HEAD } from '../app/api/qr/route';
import { currentUser } from '@clerk/nextjs/server';
import prisma from '../lib/prisma';

jest.mock('@clerk/nextjs/server', () => ({
  currentUser: jest.fn(),
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
  const user = { findUnique: jest.fn() };
  const studentBadge = { findUnique: jest.fn() };
  return {
    __esModule: true,
    default: { user, studentBadge },
  };
});

const buildUrl = (qs: string) => new URL(`http://localhost/api/qr?${qs}`).toString();
const requestLike = (qs: string, ip = '127.0.0.1') => new Request(buildUrl(qs), { headers: { 'x-forwarded-for': ip } });

const mockCurrentUser = currentUser as jest.MockedFunction<typeof currentUser>;
const mockPrisma = prisma as unknown as {
  user: { findUnique: jest.Mock };
  studentBadge: { findUnique: jest.Mock };
};

describe('QR API', () => {
  const studentId = 'student-123';
  const badgeId = 'badge-abc';
  const payload = `student:${studentId}|badge:${badgeId}`;

  beforeEach(() => {
    jest.clearAllMocks();
    const store = (globalThis as { __qrRateLimit?: Map<string, unknown> }).__qrRateLimit;
    store?.clear?.();
    mockCurrentUser.mockResolvedValue({
      id: 'clerk-1',
      emailAddresses: [{ emailAddress: 'student@example.edu' }],
    } as Awaited<ReturnType<typeof currentUser>>);
    mockPrisma.user.findUnique.mockResolvedValue({ id: studentId });
    mockPrisma.studentBadge.findUnique.mockResolvedValue({ id: 'student-badge-1' });
  });

  it('returns a PNG with content length when user owns the badge', async () => {
    const res = await GET(requestLike(`data=${encodeURIComponent(payload)}&size=180`));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');

    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.byteLength).toBeGreaterThan(0);
    expect(res.headers.get('content-length')).toBe(String(buf.byteLength));
  });

  it('handles HEAD requests with correct headers', async () => {
    const res = await HEAD(requestLike(`data=${encodeURIComponent(payload)}&size=180`, '127.0.0.2'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(Number.parseInt(res.headers.get('content-length') ?? '0', 10)).toBeGreaterThan(0);
    const body = await res.arrayBuffer();
    expect(body.byteLength).toBe(0);
  });

  it('returns 401 when not authenticated', async () => {
    mockCurrentUser.mockResolvedValue(null);
    const res = await GET(requestLike(`data=${encodeURIComponent(payload)}`));
    expect(res.status).toBe(401);
  });

  it('rejects QR generation for a different student', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'other-student' });
    const res = await GET(requestLike(`data=${encodeURIComponent(payload)}`));
    expect(res.status).toBe(403);
  });

  it('rejects QR generation when badge is not owned', async () => {
    mockPrisma.studentBadge.findUnique.mockResolvedValue(null);
    const res = await GET(requestLike(`data=${encodeURIComponent(payload)}`));
    expect(res.status).toBe(403);
  });

  it('returns 400 for invalid payload format', async () => {
    const res = await GET(requestLike('data=just-text'));
    expect(res.status).toBe(400);
  });

  it('enforces rate limiting per IP', async () => {
    const ip = '192.168.0.10';
    // First 30 requests should be allowed
    for (let i = 0; i < 30; i += 1) {
      const res = await GET(requestLike(`data=${encodeURIComponent(payload)}`, ip));
      expect(res.status).toBe(200);
    }
    // 31st request should be blocked
    const blocked = await GET(requestLike(`data=${encodeURIComponent(payload)}`, ip));
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('retry-after')).not.toBeNull();
  });
});
