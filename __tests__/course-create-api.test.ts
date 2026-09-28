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
  beforeEach(() => {
    jest.clearAllMocks();
    mockCurrentUser.mockResolvedValue({
      emailAddresses: [{ emailAddress: 'prof@example.edu' }],
    } as Awaited<ReturnType<typeof currentUser>>);
  });

  it('does not require a section count from the client', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const response = await postCourse({ title: 'Chemistry 101', roster: [] });

    // The count is derived from the roster, so validation passes and reaches the creator lookup.
    if (!response) throw new Error('Expected a response');
    expect(response.status).toBe(404);
    expect(mockPrisma.user.findUnique).toHaveBeenCalled();
  });

  it('treats section names that differ only by case or spacing as one section', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const response = await postCourse({
      title: 'Chemistry 101',
      roster: [{ email: 'ada@bu.edu', role: 'STUDENT', sections: 'A1| a1 ' }],
    });

    // Gets past the one-section-per-student check and on to the creator lookup.
    if (!response) throw new Error('Expected a response');
    expect(response.status).toBe(404);
    expect(mockPrisma.user.findUnique).toHaveBeenCalled();
  });
});
