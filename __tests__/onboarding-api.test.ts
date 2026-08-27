/** @jest-environment node */

import { NextRequest } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';

jest.mock('@clerk/nextjs/server', () => ({
  currentUser: jest.fn(),
}));

const mockPrisma = {
  user: { upsert: jest.fn() },
  avatarSetting: { upsert: jest.fn() },
  studentAnalytics: { createMany: jest.fn() },
};

jest.mock(
  '@/lib/prisma',
  () => ({
    __esModule: true,
    default: mockPrisma,
  }),
  { virtual: true }
);

jest.mock('../lib/prisma', () => ({
  __esModule: true,
  default: mockPrisma,
}));

const mockCurrentUser = currentUser as jest.MockedFunction<typeof currentUser>;

function buildRequest(body: unknown) {
  return new NextRequest('http://localhost/api/onboarding', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function postOnboarding(body: unknown) {
  const { POST } = await import('../app/api/onboarding/route');
  return (await POST(buildRequest(body))) as Response;
}

describe('onboarding API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCurrentUser.mockResolvedValue({
      emailAddresses: [{ emailAddress: 'student@example.edu' }],
    } as never);
    mockPrisma.user.upsert.mockResolvedValue({ id: 'student-1', name: 'Ada Lovelace' });
  });

  it('rejects a payload missing both names', async () => {
    const response = await postOnboarding({ avatarBase: 'SAPPHIRE' });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/first and last name/i);
    expect(mockPrisma.user.upsert).not.toHaveBeenCalled();
  });

  it('rejects a payload with a blank last name', async () => {
    const response = await postOnboarding({ firstName: 'Ada', lastName: '   ' });
    expect(response.status).toBe(400);
    expect(mockPrisma.user.upsert).not.toHaveBeenCalled();
  });

  it('accepts a payload with both names and saves the joined name', async () => {
    const response = await postOnboarding({ firstName: 'Ada', lastName: 'Lovelace', avatarBase: 'SAPPHIRE' });
    expect(response.status).toBe(200);
    expect(mockPrisma.user.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ name: 'Ada Lovelace' }),
        update: expect.objectContaining({ name: 'Ada Lovelace' }),
      })
    );
  });

  // This route is the only writer of onboardedAt, and the flag is the only thing
  // that lifts the OnboardingGate redirect. If it stops being stamped, every user
  // silently loops back into onboarding on their next page load.
  it('stamps onboardedAt on both the create and update paths', async () => {
    const response = await postOnboarding({ firstName: 'Ada', lastName: 'Lovelace', avatarBase: 'SAPPHIRE' });
    expect(response.status).toBe(200);

    const args = mockPrisma.user.upsert.mock.calls[0][0];
    expect(args.create.onboardedAt).toBeInstanceOf(Date);
    // Stamped on update too, so a user finishing after an interrupted sign-up --
    // whose row ensureCurrentUser() already provisioned -- also clears the gate.
    expect(args.update.onboardedAt).toBeInstanceOf(Date);
  });

  it('does not stamp onboardedAt when validation rejects the payload', async () => {
    const response = await postOnboarding({ firstName: 'Ada' });
    expect(response.status).toBe(400);
    expect(mockPrisma.user.upsert).not.toHaveBeenCalled();
  });
});
