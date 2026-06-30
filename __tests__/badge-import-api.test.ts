/** @jest-environment node */

import { NextRequest } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';

jest.mock('@clerk/nextjs/server', () => ({
  currentUser: jest.fn(),
}));

const mockTx = {
  course: { findFirst: jest.fn() },
  badge: { findFirst: jest.fn(), create: jest.fn() },
  lesson: { create: jest.fn() },
  lessonSkill: { createMany: jest.fn() },
  lessonSegment: { create: jest.fn(), createMany: jest.fn(), findMany: jest.fn() },
  lessonCheckpoint: { create: jest.fn(), createMany: jest.fn(), findMany: jest.fn() },
  checkpointQuestion: { createMany: jest.fn() },
  badgeRequirement: { create: jest.fn() },
  surveyPrompt: { create: jest.fn() },
  studentBadge: { createMany: jest.fn() },
};

const mockPrisma = {
  user: { findUnique: jest.fn() },
  $transaction: jest.fn((callback) => callback(mockTx)),
  __tx: mockTx,
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
  return new NextRequest('http://localhost/api/courses/course-1/badges/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function importBadge(body: unknown, courseId = 'course-1') {
  const { POST } = await import('../app/api/courses/[courseId]/badges/import/route');
  return (await POST(buildRequest(body), { params: Promise.resolve({ courseId }) })) as Response;
}

describe('badge import API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCurrentUser.mockResolvedValue({
      id: 'clerk-1',
      emailAddresses: [{ emailAddress: 'prof@example.edu' }],
    } as Awaited<ReturnType<typeof currentUser>>);
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'instructor-1' });
    mockPrisma.__tx.course.findFirst.mockResolvedValue({
      id: 'course-1',
      lessons: [{ sortOrder: 4 }],
      enrollments: [{ studentId: 'student-1' }, { studentId: 'student-2' }],
    });
    mockPrisma.__tx.badge.findFirst.mockResolvedValue({
      id: 'source-badge-1',
      sourceBadgeId: null,
      slug: 'bunsen-burner-template',
      name: 'Bunsen Burner Badge',
      description: 'Burner safety',
      category: 'EQUIPMENT',
      requirements: [
        {
          summary: JSON.stringify({
            version: 1,
            badgeName: 'Bunsen Burner Badge',
            lessonTitle: 'Bunsen Burner Lesson',
            rubricItems: [{ number: 1, text: 'Use the burner safely.' }],
            gradingCriteria: [],
            checkpoints: [],
            skills: ['Inspect setup'],
          }),
          lesson: {
            title: 'Bunsen Burner Lesson',
            summary: 'Learn burner safety',
            description: 'Burner safety',
            thumbnailUrl: 'https://i.ytimg.com/vi/abc123/hqdefault.jpg',
            estimatedMinutes: 12,
            passingPercent: 70,
            segments: [
              {
                id: 'segment-source-1',
                sortOrder: 0,
                title: 'Burner setup',
                summary: 'Setup safely',
                duration: 720,
                videoUrl: 'https://www.youtube.com/watch?v=abc123',
                muxPlaybackId: null,
                thumbnailUrl: 'https://i.ytimg.com/vi/abc123/hqdefault.jpg',
              },
            ],
            skills: [
              {
                sortOrder: 0,
                text: 'Inspect setup',
              },
            ],
            checkpoints: [
              {
                id: 'checkpoint-source-1',
                segmentId: 'segment-source-1',
                sortOrder: 0,
                title: 'Checkpoint 1',
                description: null,
                label: 'Checkpoint 1',
                meta: JSON.stringify({ points: 5, segmentLabel: 'Segment 1 Starts 00:00:00' }),
                questionCount: 1,
                timeOffsetSeconds: 60,
                snapshotUrl: null,
                questions: [
                  {
                    sortOrder: 0,
                    prompt: 'What should be checked first?',
                    options: {
                      type: 'multipleChoice',
                      options: ['Gas valve is off', 'Bench is wet'],
                      correctIndices: [0],
                    },
                    correctIndex: 0,
                  },
                ],
              },
            ],
          },
        },
      ],
    });
    mockPrisma.__tx.badge.create.mockResolvedValue({
      id: 'imported-badge-1',
      slug: 'bunsen-burner-badge-abc12345',
      name: 'Bunsen Burner Badge',
    });
    mockPrisma.__tx.lesson.create.mockResolvedValue({
      id: 'lesson-copy-1',
      slug: 'bunsen-burner-badge-abc12345-lesson',
      title: 'Bunsen Burner Lesson',
    });
    mockPrisma.__tx.lessonSkill.createMany.mockResolvedValue({ count: 1 });
    mockPrisma.__tx.lessonSegment.create.mockResolvedValue({ id: 'segment-copy-1' });
    mockPrisma.__tx.lessonSegment.createMany.mockResolvedValue({ count: 1 });
    mockPrisma.__tx.lessonSegment.findMany.mockResolvedValue([{ id: 'segment-copy-1', sortOrder: 0 }]);
    mockPrisma.__tx.lessonCheckpoint.create.mockResolvedValue({ id: 'checkpoint-copy-1' });
    mockPrisma.__tx.lessonCheckpoint.createMany.mockResolvedValue({ count: 1 });
    mockPrisma.__tx.lessonCheckpoint.findMany.mockResolvedValue([{ id: 'checkpoint-copy-1', sortOrder: 0 }]);
    mockPrisma.__tx.checkpointQuestion.createMany.mockResolvedValue({ count: 1 });
    mockPrisma.__tx.badgeRequirement.create.mockResolvedValue({ id: 'requirement-copy-1' });
  });

  it('imports a reusable badge into a course as a course-specific copy', async () => {
    const response = await importBadge({ badgeId: 'source-badge-1' });

    expect(response.status).toBe(201);
    expect(mockPrisma.__tx.course.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'course-1',
          createdById: 'instructor-1',
        },
      })
    );
    expect(mockPrisma.__tx.badge.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'source-badge-1',
          OR: [{ createdById: 'instructor-1' }, { createdById: null }],
        },
      })
    );
    expect(mockPrisma.__tx.badge.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'Bunsen Burner Badge',
          createdById: 'instructor-1',
          sourceBadgeId: 'source-badge-1',
        }),
      })
    );
    expect(mockPrisma.__tx.lesson.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          courseId: 'course-1',
          title: 'Bunsen Burner Lesson',
          sortOrder: 5,
          dueDate: null,
        }),
      })
    );
    expect(mockPrisma.__tx.lessonSegment.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            lessonId: 'lesson-copy-1',
            videoUrl: 'https://www.youtube.com/watch?v=abc123',
          }),
        ]),
      })
    );
    expect(mockPrisma.__tx.lessonSkill.createMany).toHaveBeenCalledWith({
      data: [{ lessonId: 'lesson-copy-1', sortOrder: 0, text: 'Inspect setup' }],
    });
    expect(mockPrisma.__tx.checkpointQuestion.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            checkpointId: 'checkpoint-copy-1',
            prompt: 'What should be checked first?',
            correctIndex: 0,
          }),
        ]),
      })
    );
    expect(mockPrisma.__tx.studentBadge.createMany).toHaveBeenCalledWith({
      data: [
        { studentId: 'student-1', badgeId: 'imported-badge-1', status: 'LEARNING' },
        { studentId: 'student-2', badgeId: 'imported-badge-1', status: 'LEARNING' },
      ],
      skipDuplicates: true,
    });

    const body = await response.json();
    expect(body).toEqual(
      expect.objectContaining({
        message: 'Badge imported successfully.',
        sourceBadgeId: 'source-badge-1',
        assignedToCourseId: 'course-1',
        studentBadgeCount: 2,
      })
    );
  });

  it('imports all checkpoint questions from a source badge summary when no source lesson exists', async () => {
    mockPrisma.__tx.badge.findFirst.mockResolvedValue({
      id: 'source-badge-1',
      sourceBadgeId: null,
      slug: 'library-badge',
      name: 'Library Badge',
      description: 'Created before course assignment',
      category: 'SAFETY',
      requirements: [
        {
          summary: JSON.stringify({
            version: 2,
            badgeName: 'Library Badge',
            lessonTitle: 'Library Lesson',
            skills: ['Observe carefully'],
            checkpoints: [
              {
                title: 'Checkpoint 1',
                time: '00:01:00',
                questions: [
                  {
                    question: 'First question?',
                    questionType: 'multipleChoice',
                    options: ['One', 'Two'],
                    correctIndices: [0],
                  },
                  {
                    question: 'Second question?',
                    questionType: 'multipleChoice',
                    options: ['Red', 'Blue'],
                    correctIndices: [1],
                  },
                ],
              },
            ],
          }),
          lesson: null,
        },
      ],
    });

    const response = await importBadge({ badgeId: 'source-badge-1' });

    expect(response.status).toBe(201);
    expect(mockPrisma.__tx.lessonCheckpoint.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            meta: '2 questions',
            questionCount: 2,
            timeOffsetSeconds: 60,
          }),
        ],
      })
    );
    expect(mockPrisma.__tx.checkpointQuestion.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            checkpointId: 'checkpoint-copy-1',
            sortOrder: 0,
            prompt: 'First question?',
            correctIndex: 0,
          }),
          expect.objectContaining({
            checkpointId: 'checkpoint-copy-1',
            sortOrder: 1,
            prompt: 'Second question?',
            correctIndex: 1,
          }),
        ],
      })
    );
  });
});
