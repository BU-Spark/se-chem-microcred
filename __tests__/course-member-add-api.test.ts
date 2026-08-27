/** @jest-environment node */
// Issues: #258 multi-word last names

import { NextRequest } from 'next/server';

const mockEnsureCurrentUser = jest.fn();

const tx = {
  user: { findMany: jest.fn(), createMany: jest.fn(), updateMany: jest.fn() },
  enrollment: { findMany: jest.fn(), createMany: jest.fn() },
  enrollmentSection: { createMany: jest.fn() },
  badgeRequirement: { findMany: jest.fn() },
  studentBadge: { createMany: jest.fn() },
  studentAnalytics: { createMany: jest.fn() },
};

const mockPrisma = {
  course: { findUnique: jest.fn() },
  $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
};

jest.mock('@/app/api/courses/lib/ensure-user', () => ({ ensureCurrentUser: () => mockEnsureCurrentUser() }), {
  virtual: true,
});
jest.mock('../app/api/courses/lib/ensure-user', () => ({ ensureCurrentUser: () => mockEnsureCurrentUser() }));
jest.mock('../lib/prisma', () => ({ __esModule: true, default: mockPrisma }));

function request(body: unknown) {
  return new NextRequest('http://localhost/api/courses/course-1/members', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function addMembers(body: unknown) {
  const { POST } = await import('../app/api/courses/[courseId]/members/route');
  return POST(request(body), { params: Promise.resolve({ courseId: 'course-1' }) });
}

describe('add course roster members API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEnsureCurrentUser.mockResolvedValue({ id: 'instructor-1' });
    mockPrisma.course.findUnique.mockResolvedValue({ createdById: 'instructor-1' });
    tx.user.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'student-1', name: 'Ada Lovelace', email: 'ada@bu.edu', externalId: null }]);
    tx.user.createMany.mockResolvedValue({ count: 1 });
    tx.enrollment.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'enrollment-1', studentId: 'student-1' }]);
    tx.enrollment.createMany.mockResolvedValue({ count: 1 });
    tx.enrollmentSection.createMany.mockResolvedValue({ count: 1 });
    tx.badgeRequirement.findMany.mockResolvedValue([]);
    tx.studentAnalytics.createMany.mockResolvedValue({ count: 1 });
  });

  // Adding someone to an existing roster resolves them to their existing User row
  // rather than creating one, and only createMany ever wrote externalId -- so the
  // BUID in the CSV was silently dropped for anyone who had already signed in.
  describe('capturing a BUID for someone who already has a User row', () => {
    function existingUser(overrides: Record<string, unknown> = {}) {
      return {
        id: 'student-1',
        name: 'Ada Lovelace',
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@bu.edu',
        externalId: null,
        ...overrides,
      };
    }

    beforeEach(() => {
      jest.clearAllMocks();
      // clearAllMocks only clears recorded calls -- the enclosing beforeEach queues
      // its findMany results with mockResolvedValueOnce, and that queue survives and
      // would shadow the rows these tests set up. Reset the queued implementations.
      tx.user.findMany.mockReset();
      tx.enrollment.findMany.mockReset();
      mockEnsureCurrentUser.mockResolvedValue({ id: 'instructor-1' });
      mockPrisma.course.findUnique.mockResolvedValue({ createdById: 'instructor-1' });
      tx.user.createMany.mockResolvedValue({ count: 0 });
      // First call is the role-conflict check (none), second returns the ids.
      tx.enrollment.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValue([{ id: 'enrollment-1', studentId: 'student-1' }]);
      tx.enrollment.createMany.mockResolvedValue({ count: 1 });
      tx.enrollmentSection.createMany.mockResolvedValue({ count: 1 });
      tx.badgeRequirement.findMany.mockResolvedValue([]);
      tx.studentAnalytics.createMany.mockResolvedValue({ count: 1 });
      tx.user.updateMany.mockResolvedValue({ count: 1 });
    });

    it('writes the externalId onto a row matched by email', async () => {
      tx.user.findMany.mockResolvedValue([existingUser()]);

      const response = await addMembers({
        role: 'STUDENT',
        members: [
          { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@bu.edu', externalId: 'U1234567', sections: 'A1' },
        ],
      });

      expect(response.status).toBe(200);
      expect(tx.user.createMany).not.toHaveBeenCalled();
      expect(tx.user.updateMany).toHaveBeenCalledWith({
        where: { id: 'student-1', externalId: null },
        data: { externalId: 'U1234567' },
      });
    });

    it('never overwrites an externalId the person already has', async () => {
      tx.user.findMany.mockResolvedValue([existingUser({ externalId: 'U0000001' })]);

      const response = await addMembers({
        role: 'STUDENT',
        members: [
          { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@bu.edu', externalId: 'U9999999', sections: 'A1' },
        ],
      });

      expect(response.status).toBe(200);
      const externalIdWrites = tx.user.updateMany.mock.calls.filter(
        ([args]) => (args as { data: Record<string, unknown> }).data.externalId !== undefined
      );
      expect(externalIdWrites).toHaveLength(0);
    });

    it('writes the externalId even when the name is already on file', async () => {
      tx.user.findMany.mockResolvedValue([existingUser()]);

      await addMembers({
        role: 'STUDENT',
        members: [
          { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@bu.edu', externalId: 'U1234567', sections: 'A1' },
        ],
      });

      // The name half is already populated, so only the externalId update fires.
      expect(tx.user.updateMany).toHaveBeenCalledTimes(1);
      expect(tx.user.updateMany).toHaveBeenCalledWith({
        where: { id: 'student-1', externalId: null },
        data: { externalId: 'U1234567' },
      });
    });

    it('updates a given person once even when the CSV lists them on several rows', async () => {
      tx.user.findMany.mockResolvedValue([existingUser()]);

      await addMembers({
        role: 'CHECKER',
        members: [
          { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@bu.edu', externalId: 'U1234567', sections: 'A1' },
          { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@bu.edu', externalId: 'U1234567', sections: 'A2' },
        ],
      });

      expect(tx.user.updateMany).toHaveBeenCalledTimes(1);
    });
  });

  it('adds a student without replacing existing enrollments', async () => {
    const response = await addMembers({
      role: 'STUDENT',
      members: [{ firstName: 'Ada', lastName: 'Lovelace', email: 'ADA@BU.EDU', sections: 'A1' }],
    });

    expect(response.status).toBe(200);
    expect(tx.enrollment.createMany).toHaveBeenCalledWith({
      data: [{ studentId: 'student-1', courseId: 'course-1', role: 'STUDENT', status: 'ACTIVE' }],
      skipDuplicates: true,
    });
    expect(tx.enrollmentSection.createMany).toHaveBeenCalledWith({
      data: [{ enrollmentId: 'enrollment-1', section: 'A1' }],
      skipDuplicates: true,
    });
    expect(tx.enrollment).not.toHaveProperty('deleteMany');
  });

  it('rejects roster changes from a non-owner', async () => {
    mockPrisma.course.findUnique.mockResolvedValue({ createdById: 'another-instructor' });
    const response = await addMembers({ role: 'CHECKER', members: [{ email: 'ta@bu.edu' }] });
    expect(response.status).toBe(403);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });
});
