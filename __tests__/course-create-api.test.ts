/** @jest-environment node */

import { NextRequest } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';

import { POST } from '../app/api/courses/route';
import prisma from '../lib/prisma';

jest.mock('@clerk/nextjs/server', () => ({
  currentUser: jest.fn(),
}));

jest.mock('../lib/prisma', () => ({
  __esModule: true,
  default: {
    user: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

const mockCurrentUser = currentUser as jest.MockedFunction<typeof currentUser>;
const mockPrisma = prisma as unknown as {
  user: { findUnique: jest.Mock };
  $transaction: jest.Mock;
};

function postCourse(body: unknown) {
  return POST(
    new NextRequest('http://localhost/api/courses', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    })
  );
}

describe('POST /api/courses', () => {
  const originalAlphaMode = process.env.ALPHA_MODE;
  const originalAdminEmails = process.env.ALPHA_ADMIN_EMAILS;

  beforeEach(() => {
    jest.clearAllMocks();
    // These tests exercise creation logic, not the alpha lock — keep the lock off
    // so they are independent of the ambient .env value. Lock behavior is covered
    // separately below.
    process.env.ALPHA_MODE = 'false';
    mockCurrentUser.mockResolvedValue({
      emailAddresses: [{ emailAddress: 'prof@example.edu' }],
    } as Awaited<ReturnType<typeof currentUser>>);
  });

  afterAll(() => {
    process.env.ALPHA_MODE = originalAlphaMode;
    process.env.ALPHA_ADMIN_EMAILS = originalAdminEmails;
  });

  it('rejects course creation without at least one section', async () => {
    const response = await postCourse({
      title: 'Chemistry 101',
      sectionCount: 0,
      roster: [],
    });

    expect(response).toBeDefined();
    if (!response) throw new Error('Expected a response');
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(
      expect.objectContaining({
        error: 'Course must have at least 1 section.',
      })
    );
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  describe('alpha lock', () => {
    it('rejects creation with 403 when alpha mode is on and the user is not allowlisted', async () => {
      process.env.ALPHA_MODE = 'true';
      process.env.ALPHA_ADMIN_EMAILS = 'admin@example.edu';

      const response = await postCourse({ title: 'Chemistry 101', sectionCount: 1, roster: [] });

      expect(response).toBeDefined();
      if (!response) throw new Error('Expected a response');
      expect(response.status).toBe(403);
      expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('allows an allowlisted admin to create when alpha mode is on', async () => {
      process.env.ALPHA_MODE = 'true';
      process.env.ALPHA_ADMIN_EMAILS = 'prof@example.edu';

      // Past the gate we still hit the missing-user path, but crucially not a 403.
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const response = await postCourse({ title: 'Chemistry 101', sectionCount: 1, roster: [] });

      expect(response).toBeDefined();
      if (!response) throw new Error('Expected a response');
      expect(response.status).not.toBe(403);
      expect(mockPrisma.user.findUnique).toHaveBeenCalled();
    });
  });
});
