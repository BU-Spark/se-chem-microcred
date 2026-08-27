/** @jest-environment node */

import { POST } from '../app/api/lessons/[lessonId]/survey/route';
import prisma from '../lib/prisma';

jest.mock('../lib/prisma', () => ({
  __esModule: true,
  default: {
    user: { findUnique: jest.fn() },
    lesson: { findUnique: jest.fn() },
    lessonProgress: { findUnique: jest.fn() },
    surveyPrompt: { findFirst: jest.fn(), create: jest.fn() },
    surveyResponse: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
  },
}));

const mockPrisma = prisma as unknown as {
  user: { findUnique: jest.Mock };
  lesson: { findUnique: jest.Mock };
  lessonProgress: { findUnique: jest.Mock };
  surveyPrompt: { findFirst: jest.Mock; create: jest.Mock };
  surveyResponse: { findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
};

function postRating(body: unknown, lessonId = 'lesson-1') {
  return POST(
    new Request('http://localhost/api/lessons/lesson-1/survey', { method: 'POST', body: JSON.stringify(body) }),
    {
      params: Promise.resolve({ lessonId }),
    }
  );
}

describe('POST /api/lessons/[lessonId]/survey', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'student-1' });
    mockPrisma.lesson.findUnique.mockResolvedValue({ id: 'lesson-1', title: 'Bunsen Burners' });
    mockPrisma.lessonProgress.findUnique.mockResolvedValue({ status: 'COMPLETED', lastGradePassed: true });
    mockPrisma.surveyPrompt.findFirst.mockResolvedValue({ id: 'prompt-1' });
    mockPrisma.surveyResponse.findFirst.mockResolvedValue(null);
    mockPrisma.surveyResponse.create.mockResolvedValue({ id: 'response-1' });
  });

  it('stores a rating for a student who passed the lesson', async () => {
    const response = await postRating({ email: 'Student@BU.edu', rating: 4 });

    expect(response.status).toBe(200);
    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'student@bu.edu' } })
    );
    expect(mockPrisma.surveyResponse.create).toHaveBeenCalledWith({
      data: { promptId: 'prompt-1', studentId: 'student-1', rating: 4, comment: null },
    });
  });

  // The aggregate on the badge page counts everything stored here, so the
  // pass gate has to live at write time.
  it('rejects a rating from a student who has not passed', async () => {
    mockPrisma.lessonProgress.findUnique.mockResolvedValue({ status: 'COMPLETED', lastGradePassed: false });

    const response = await postRating({ email: 'student@bu.edu', rating: 5 });

    expect(response.status).toBe(409);
    expect(mockPrisma.surveyResponse.create).not.toHaveBeenCalled();
  });

  it('rejects a rating from a student who has not finished the lesson', async () => {
    mockPrisma.lessonProgress.findUnique.mockResolvedValue({ status: 'IN_PROGRESS', lastGradePassed: null });

    expect((await postRating({ email: 'student@bu.edu', rating: 5 })).status).toBe(409);
  });

  it('rejects a rating from a student with no progress row at all', async () => {
    mockPrisma.lessonProgress.findUnique.mockResolvedValue(null);

    expect((await postRating({ email: 'student@bu.edu', rating: 5 })).status).toBe(409);
  });

  it.each([0, 6, 2.5, undefined, 'four'])('rejects the out-of-scale rating %s', async (rating) => {
    const response = await postRating({ email: 'student@bu.edu', rating });

    expect(response.status).toBe(400);
    expect(mockPrisma.surveyResponse.create).not.toHaveBeenCalled();
  });

  it('creates the lesson prompt on first use', async () => {
    mockPrisma.surveyPrompt.findFirst.mockResolvedValue(null);
    mockPrisma.surveyPrompt.create.mockResolvedValue({ id: 'prompt-new' });

    await postRating({ email: 'student@bu.edu', rating: 3 });

    expect(mockPrisma.surveyPrompt.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ context: 'LESSON', lessonId: 'lesson-1' }),
      })
    );
    expect(mockPrisma.surveyResponse.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ promptId: 'prompt-new' }) })
    );
  });

  it('overwrites an earlier rating when a student redoes the lesson', async () => {
    mockPrisma.surveyResponse.findFirst.mockResolvedValue({ id: 'response-old' });

    await postRating({ email: 'student@bu.edu', rating: 2 });

    expect(mockPrisma.surveyResponse.update).toHaveBeenCalledWith({
      where: { id: 'response-old' },
      data: { rating: 2, comment: null },
    });
    expect(mockPrisma.surveyResponse.create).not.toHaveBeenCalled();
  });

  it('404s for an unknown student or lesson', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    expect((await postRating({ email: 'nobody@bu.edu', rating: 3 })).status).toBe(404);

    mockPrisma.user.findUnique.mockResolvedValue({ id: 'student-1' });
    mockPrisma.lesson.findUnique.mockResolvedValue(null);
    expect((await postRating({ email: 'student@bu.edu', rating: 3 })).status).toBe(404);
  });

  it('requires an email', async () => {
    expect((await postRating({ rating: 3 })).status).toBe(400);
  });
});
