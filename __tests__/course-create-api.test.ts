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
});
