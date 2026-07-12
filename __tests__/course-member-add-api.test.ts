/** @jest-environment node */

import { NextRequest } from 'next/server';

const mockEnsureCurrentUser = jest.fn();

const tx = {
  user: { findMany: jest.fn(), createMany: jest.fn() },
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
      .mockResolvedValueOnce([{ id: 'student-1', name: 'Ada Lovelace', email: 'ada@bu.edu', buid: null }]);
    tx.user.createMany.mockResolvedValue({ count: 1 });
    tx.enrollment.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'enrollment-1', studentId: 'student-1' }]);
    tx.enrollment.createMany.mockResolvedValue({ count: 1 });
    tx.enrollmentSection.createMany.mockResolvedValue({ count: 1 });
    tx.badgeRequirement.findMany.mockResolvedValue([]);
    tx.studentAnalytics.createMany.mockResolvedValue({ count: 1 });
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
