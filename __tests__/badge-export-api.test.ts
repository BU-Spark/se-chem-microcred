/** @jest-environment node */

import { NextRequest } from 'next/server';

jest.mock('../lib/prisma', () => {
  const user = { findUnique: jest.fn() };
  const studentBadge = { findUnique: jest.fn() };
  return { __esModule: true, default: { user, studentBadge } };
});

import prisma from '../lib/prisma';

const mockPrisma = prisma as unknown as {
  user: { findUnique: jest.Mock };
  studentBadge: { findUnique: jest.Mock };
};

const originalPublicEnv = {
  APP_URL: process.env.APP_URL,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  RAILWAY_PUBLIC_DOMAIN: process.env.RAILWAY_PUBLIC_DOMAIN,
};

function clearPublicEnv() {
  delete process.env.APP_URL;
  delete process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.RAILWAY_PUBLIC_DOMAIN;
}

function restorePublicEnv() {
  for (const [key, value] of Object.entries(originalPublicEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function requestFor(origin = 'http://localhost') {
  return new NextRequest(`${origin}/api/badges/export/badge-1?email=student%40example.com`);
}

async function exportBadge(origin?: string) {
  const { GET } = await import('../app/api/badges/export/[id]/route');
  return (await GET(requestFor(origin), {
    params: Promise.resolve({ id: 'badge-1' }),
  })) as Response;
}

describe('/api/badges/export/[id]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearPublicEnv();
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'student-1',
      name: 'Ada Student',
      email: 'student@example.com',
    });
    mockPrisma.studentBadge.findUnique.mockResolvedValue({
      id: 'sb-1',
      status: 'COMPLETED',
      awardedAt: new Date('2026-05-15T00:00:00.000Z'),
      badge: {
        slug: 'lab-safety',
        name: 'Lab Safety',
        description: 'Completed the lab-safety micro-credential.',
      },
    });
  });

  afterEach(() => {
    restorePublicEnv();
  });

  // Regression for #54: the credential URL was hardcoded to the placeholder
  // checkd.example.com, so the certUrl LinkedIn receives pointed at a domain the
  // platform does not own. It must be derived from the request origin, the same
  // way every QR/short-code link in the app is built (lib/requestOrigin).
  it('derives the credential URL from the request origin, not a hardcoded host', async () => {
    const response = await exportBadge('http://localhost');

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.exportPayload.credentialUrl).toBe('http://localhost/badges/lab-safety');
    expect(body.exportPayload.issuer.website).toBe('http://localhost');
    expect(JSON.stringify(body)).not.toContain('checkd.example.com');

    const linkedIn = new URL(body.linkedInUrl);
    expect(linkedIn.searchParams.get('certUrl')).toBe('http://localhost/badges/lab-safety');
  });

  it('honors the configured public origin for the credential URL', async () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://credentials.university.test';

    const response = await exportBadge('http://localhost');
    const body = await response.json();

    expect(body.exportPayload.credentialUrl).toBe('https://credentials.university.test/badges/lab-safety');
    expect(body.exportPayload.issuer.website).toBe('https://credentials.university.test');
    const linkedIn = new URL(body.linkedInUrl);
    expect(linkedIn.searchParams.get('certUrl')).toBe('https://credentials.university.test/badges/lab-safety');
  });

  it('still carries the LinkedIn certification metadata', async () => {
    const response = await exportBadge('http://localhost');
    const body = await response.json();

    const linkedIn = new URL(body.linkedInUrl);
    expect(linkedIn.origin + linkedIn.pathname).toBe('https://www.linkedin.com/profile/add');
    expect(linkedIn.searchParams.get('name')).toBe('Lab Safety');
    expect(linkedIn.searchParams.get('issueYear')).toBe('2026');
    expect(linkedIn.searchParams.get('issueMonth')).toBe('5');
    expect(linkedIn.searchParams.get('certId')).toBe('sb-1');
  });

  it('requires an email', async () => {
    const { GET } = await import('../app/api/badges/export/[id]/route');
    const response = (await GET(new NextRequest('http://localhost/api/badges/export/badge-1'), {
      params: Promise.resolve({ id: 'badge-1' }),
    })) as Response;

    expect(response.status).toBe(400);
  });

  it('refuses to export a badge that is not completed', async () => {
    mockPrisma.studentBadge.findUnique.mockResolvedValue({
      id: 'sb-1',
      status: 'IN_REVIEW',
      awardedAt: null,
      badge: { slug: 'lab-safety', name: 'Lab Safety', description: null },
    });

    const response = await exportBadge('http://localhost');
    expect(response.status).toBe(409);
  });
});
