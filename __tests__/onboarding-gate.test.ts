/** @jest-environment node */

import { currentUser } from '@clerk/nextjs/server';

import { isOnboardingExemptPath } from '../lib/onboardingPaths';

jest.mock('@clerk/nextjs/server', () => ({
  currentUser: jest.fn(),
}));

const mockPrisma = {
  user: { findUnique: jest.fn() },
};

jest.mock('@/lib/prisma', () => ({ __esModule: true, default: mockPrisma }), { virtual: true });
jest.mock('../lib/prisma', () => ({ __esModule: true, default: mockPrisma }));

const mockCurrentUser = currentUser as jest.MockedFunction<typeof currentUser>;

async function needsOnboarding() {
  const mod = await import('../lib/onboarding');
  return mod.needsOnboarding();
}

describe('isOnboardingExemptPath', () => {
  // Every one of these has to stay reachable while onboardedAt is still null,
  // otherwise the gate redirects a user into a page that redirects them back.
  it.each([
    '/onboarding',
    '/api/onboarding',
    '/sign-in',
    '/sign-in/factor-one',
    '/sign-up',
    '/sign-up/verify-email-address',
    '/splash',
    '/qr/assessment',
  ])('exempts %s', (path) => {
    expect(isOnboardingExemptPath(path)).toBe(true);
  });

  it.each(['/', '/courses', '/badges', '/profile', '/instructor'])('gates %s', (path) => {
    expect(isOnboardingExemptPath(path)).toBe(false);
  });

  // A prefix match must not leak to a sibling route that merely starts with the
  // same characters.
  it('does not exempt a route that only shares a prefix', () => {
    expect(isOnboardingExemptPath('/onboarding-report')).toBe(false);
    expect(isOnboardingExemptPath('/sign-into-something')).toBe(false);
  });

  it('ignores query strings and hashes', () => {
    expect(isOnboardingExemptPath('/onboarding?step=2')).toBe(true);
    expect(isOnboardingExemptPath('/courses?tab=enrolled')).toBe(false);
  });
});

describe('needsOnboarding', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCurrentUser.mockResolvedValue({
      emailAddresses: [{ emailAddress: 'Student@Example.edu' }],
    } as never);
  });

  it('is true for a signed-in user with no DB row yet', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    await expect(needsOnboarding()).resolves.toBe(true);
  });

  // The regression this whole change exists for: ensureCurrentUser() provisions a
  // row on any page load, so "row exists" must not be read as "onboarded".
  it('is true for a lazily-provisioned row with a null onboardedAt', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ onboardedAt: null });
    await expect(needsOnboarding()).resolves.toBe(true);
  });

  it('is false once onboardedAt is set', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ onboardedAt: new Date() });
    await expect(needsOnboarding()).resolves.toBe(false);
  });

  it('is false when nobody is signed in, and does not hit the database', async () => {
    mockCurrentUser.mockResolvedValue(null as never);
    await expect(needsOnboarding()).resolves.toBe(false);
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('is false for a signed-in user with no email address', async () => {
    mockCurrentUser.mockResolvedValue({ emailAddresses: [] } as never);
    await expect(needsOnboarding()).resolves.toBe(false);
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('looks the user up by lowercased email, matching the rest of the app', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ onboardedAt: new Date() });
    await needsOnboarding();
    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'student@example.edu' } })
    );
  });

  it('never writes to the database', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    await needsOnboarding();
    // A missing row is the "never onboarded" signal; provisioning one here would
    // destroy the very thing the gate reads.
    expect(Object.keys(mockPrisma.user)).toEqual(['findUnique']);
  });
});
