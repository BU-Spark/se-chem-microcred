/** @jest-environment node */

import { NextRequest } from 'next/server';

const mockEnsureCurrentUser = jest.fn();

const mockPrisma = {
  enrollment: { findFirst: jest.fn() },
  enrollmentSection: { deleteMany: jest.fn(), createMany: jest.fn() },
  $transaction: jest.fn(async (operations: unknown[]) => operations),
};

jest.mock('../app/api/courses/lib/ensure-user', () => ({ ensureCurrentUser: () => mockEnsureCurrentUser() }));
jest.mock('../lib/prisma', () => ({ __esModule: true, default: mockPrisma }));

async function putSections(sections: unknown) {
  const { PUT } = await import('../app/api/courses/[courseId]/enrollments/[enrollmentId]/sections/route');
  const req = new NextRequest('http://localhost/api/courses/course-1/enrollments/enrollment-1/sections', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sections }),
  });
  return PUT(req, { params: Promise.resolve({ courseId: 'course-1', enrollmentId: 'enrollment-1' }) });
}

describe('enrollment sections API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEnsureCurrentUser.mockResolvedValue({ id: 'instructor-1' });
    mockPrisma.enrollment.findFirst.mockResolvedValue({
      id: 'enrollment-1',
      role: 'STUDENT',
      course: { sections: ['A1', 'B2'] },
    });
  });

  it('reassigns a student to an existing section', async () => {
    const response = await putSections(['b2']);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ message: 'Sections updated.', sections: ['B2'] });
    expect(mockPrisma.enrollmentSection.deleteMany).toHaveBeenCalledWith({ where: { enrollmentId: 'enrollment-1' } });
    expect(mockPrisma.enrollmentSection.createMany).toHaveBeenCalledWith({
      data: [{ enrollmentId: 'enrollment-1', section: 'B2' }],
    });
  });

  it('treats one name in two cases as a single section for a student', async () => {
    const response = await putSections(['A1', 'a1 ']);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ message: 'Sections updated.', sections: ['A1'] });
  });

  it('rejects a section that does not exist in the course', async () => {
    const response = await putSections(['C3']);

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe(
      'Section "C3" does not exist in this course. Existing sections: A1, B2.'
    );
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('lets a checker cover several existing sections but names every unknown one', async () => {
    mockPrisma.enrollment.findFirst.mockResolvedValue({
      id: 'enrollment-1',
      role: 'CHECKER',
      course: { sections: ['A1', 'B2'] },
    });

    const response = await putSections(['A1', 'X9', 'Y8']);

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe(
      'Sections "X9", "Y8" do not exist in this course. Existing sections: A1, B2.'
    );
  });

  it('accepts a saved section that no one is in any more', async () => {
    // B2 has no enrollments left, but it is still one of the course's saved sections.
    const response = await putSections(['B2']);

    expect(response.status).toBe(200);
    expect(mockPrisma.enrollmentSection.createMany).toHaveBeenCalledWith({
      data: [{ enrollmentId: 'enrollment-1', section: 'B2' }],
    });
  });

  it('allows clearing a member out of every section', async () => {
    const response = await putSections([]);

    expect(response.status).toBe(200);
    expect(mockPrisma.enrollmentSection.createMany).not.toHaveBeenCalled();
  });
});
