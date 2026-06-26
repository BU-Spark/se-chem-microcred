/** @jest-environment node */

import { NextRequest } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';

jest.mock('@clerk/nextjs/server', () => ({
  currentUser: jest.fn(),
}));

const mockTx = {
  course: { findFirst: jest.fn() },
  badge: { create: jest.fn(), update: jest.fn(), updateMany: jest.fn(), findMany: jest.fn() },
  lesson: { create: jest.fn() },
  lessonSegment: { create: jest.fn() },
  lessonCheckpoint: { createMany: jest.fn(), findMany: jest.fn() },
  checkpointQuestion: { createMany: jest.fn() },
  badgeRequirement: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  surveyPrompt: { create: jest.fn() },
  studentBadge: { createMany: jest.fn() },
};

const mockPrisma = {
  user: { findUnique: jest.fn() },
  badge: { findMany: jest.fn() },
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
  return new NextRequest('http://localhost/api/badges', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function postBadge(body: unknown) {
  const { POST } = await import('../app/api/badges/route');
  return (await POST(buildRequest(body))) as Response;
}

async function patchBadge(body: unknown) {
  const { PATCH } = await import('../app/api/badges/route');
  return (await PATCH(buildRequest(body))) as Response;
}

async function getBadges() {
  const { GET } = await import('../app/api/badges/route');
  return (await GET()) as Response;
}

describe('badge creation API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCurrentUser.mockResolvedValue({
      id: 'clerk-1',
      emailAddresses: [{ emailAddress: 'prof@example.edu' }],
    } as Awaited<ReturnType<typeof currentUser>>);
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'instructor-1' });
    mockPrisma.__tx.course.findFirst.mockResolvedValue({
      id: 'course-1',
      lessons: [{ sortOrder: 2 }],
      enrollments: [{ studentId: 'student-1' }, { studentId: 'student-2' }],
    });
    mockPrisma.__tx.badge.create.mockResolvedValue({
      id: 'source-badge-1',
      slug: 'bunsen-burner-source',
      name: 'Bunsen Burner',
      description: 'Burner safety',
      category: 'EQUIPMENT',
    });
    mockPrisma.__tx.lesson.create.mockResolvedValue({
      id: 'lesson-1',
      slug: 'bunsen-burner-abc12345-lesson',
      title: 'Burner lesson',
    });
    mockPrisma.__tx.lessonSegment.create.mockResolvedValue({ id: 'segment-1' });
    mockPrisma.__tx.lessonCheckpoint.createMany.mockResolvedValue({ count: 2 });
    mockPrisma.__tx.lessonCheckpoint.findMany.mockResolvedValue([
      { id: 'checkpoint-1', sortOrder: 0 },
      { id: 'checkpoint-2', sortOrder: 1 },
    ]);
    mockPrisma.__tx.checkpointQuestion.createMany.mockResolvedValue({ count: 2 });
    mockPrisma.__tx.badgeRequirement.create.mockResolvedValue({ id: 'requirement-1' });
    mockPrisma.__tx.badge.update.mockResolvedValue({
      id: 'badge-1',
      slug: 'updated-badge',
      name: 'Updated Badge',
      description: 'Updated description',
      category: 'SAFETY',
    });
    mockPrisma.__tx.badgeRequirement.findFirst.mockResolvedValue({
      id: 'requirement-1',
      lesson: { title: 'Existing lesson' },
    });
    mockPrisma.__tx.badge.findMany.mockResolvedValue([]);
  });

  it('creates badge, lesson, checkpoint question, and student badge rows for the course', async () => {
    mockPrisma.__tx.badge.create
      .mockResolvedValueOnce({
        id: 'source-badge-1',
        slug: 'bunsen-burner-source',
        name: 'Bunsen Burner',
        description: 'Burner safety',
        category: 'EQUIPMENT',
      })
      .mockResolvedValueOnce({
        id: 'course-badge-1',
        slug: 'bunsen-burner-course',
        name: 'Bunsen Burner',
        description: 'Burner safety',
        category: 'EQUIPMENT',
      });

    const response = await postBadge({
      courseId: 'course-1',
      badgeName: 'Bunsen Burner',
      badgeDescription: 'Burner safety',
      category: 'EQUIPMENT',
      youtubeUrl: 'https://www.youtube.com/watch?v=abc123',
      videoTitle: 'Burner lesson',
      videoLength: '00:20:00',
      checkpoints: [
        {
          title: 'Checkpoint 1',
          time: '00:03:00',
          points: 5,
          question: 'What should you check first?',
          options: ['Gas off', 'Gas on'],
          correctIndices: [0, 1],
          segmentLabel: 'Segment 1 Starts 00:00:00',
        },
        {
          title: 'Checkpoint 2',
          time: '00:05:00',
          points: 5,
          questionType: 'shortAnswer',
          question: 'What temperature range is acceptable?',
          numericAnswer: '42',
          numericRangeMin: '40',
          numericRangeMax: '45',
          segmentLabel: 'Segment 1 Starts 00:00:00',
        },
      ],
      rubricOverview: 'Use safe setup and shutdown.',
    });

    expect(response.status).toBe(201);
    expect(mockPrisma.__tx.course.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'course-1', createdById: 'instructor-1' },
      })
    );
    expect(mockPrisma.__tx.badge.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'Bunsen Burner',
          description: 'Burner safety',
          category: 'EQUIPMENT',
          createdById: 'instructor-1',
        }),
      })
    );
    expect(mockPrisma.__tx.badge.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'Bunsen Burner',
          sourceBadgeId: 'source-badge-1',
          createdById: 'instructor-1',
        }),
      })
    );
    expect(mockPrisma.__tx.lessonCheckpoint.createMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.__tx.checkpointQuestion.createMany).toHaveBeenCalledTimes(1);
    const questionData = mockPrisma.__tx.checkpointQuestion.createMany.mock.calls[0][0].data as Array<{
      checkpointId: string;
      prompt: string;
      options: unknown;
      correctIndex: number | null;
    }>;
    expect(questionData).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          checkpointId: 'checkpoint-1',
          prompt: 'What should you check first?',
          options: {
            type: 'multipleChoice',
            options: ['Gas off', 'Gas on'],
            correctIndices: [0, 1],
          },
          correctIndex: 0,
        }),
        expect.objectContaining({
          checkpointId: 'checkpoint-2',
          prompt: 'What temperature range is acceptable?',
          options: {
            type: 'shortAnswer',
            expectedAnswer: 42,
            acceptedRange: { min: 40, max: 45 },
          },
          correctIndex: null,
        }),
      ])
    );
    expect(mockPrisma.__tx.studentBadge.createMany).toHaveBeenCalledWith({
      data: [
        { studentId: 'student-1', badgeId: 'course-badge-1', status: 'LEARNING' },
        { studentId: 'student-2', badgeId: 'course-badge-1', status: 'LEARNING' },
      ],
      skipDuplicates: true,
    });

    const body = await response.json();
    expect(body).toEqual(
      expect.objectContaining({
        message: 'Badge created successfully.',
        sourceBadgeId: 'source-badge-1',
        courseBadge: expect.objectContaining({ id: 'course-badge-1' }),
        studentBadgeCount: 2,
      })
    );
  });

  it('creates an independent badge when course id is missing', async () => {
    const response = await postBadge({
      badgeName: 'Independent Badge',
      badgeDescription: 'Reusable credential',
      rubricItems: [{ text: 'Student demonstrates the skill.' }],
      gradingCriteria: [
        {
          prompt: 'Technique',
          options: ['Needs support', 'Meets expectations'],
        },
      ],
    });

    expect(response.status).toBe(201);
    expect(mockPrisma.__tx.course.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.__tx.lesson.create).not.toHaveBeenCalled();
    expect(mockPrisma.__tx.badge.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          createdById: 'instructor-1',
        }),
      })
    );
    expect(mockPrisma.__tx.studentBadge.createMany).not.toHaveBeenCalled();

    const body = await response.json();
    expect(body).toEqual(
      expect.objectContaining({
        message: 'Badge created successfully.',
        lesson: null,
        courseBadge: null,
        sourceBadgeId: 'source-badge-1',
        assignedToCourseId: null,
        studentBadgeCount: 0,
      })
    );
  });

  it('returns all badges for the badges tab', async () => {
    mockPrisma.badge.findMany.mockResolvedValue([
      {
        id: 'badge-1',
        slug: 'bunsen-burner-badge',
        name: 'Bunsen Burner Badge',
        description: 'Prove safe usage and understanding of flame control.',
        category: 'EQUIPMENT',
        createdAt: new Date('2025-02-20T17:00:00.000Z'),
        requirements: [
          {
            id: 'requirement-1',
            summary: JSON.stringify({
              rubricItems: [{ number: 1, text: 'Use the burner safely.' }],
              gradingCriteria: [],
            }),
            lesson: {
              id: 'lesson-1',
              title: 'Bunsen Burners',
              course: {
                id: 'course-1',
                title: 'Chem 101: Safety Foundations',
              },
            },
          },
        ],
        _count: {
          studentProgress: 2,
        },
      },
    ]);

    const response = await getBadges();

    expect(response.status).toBe(200);
    expect(mockPrisma.badge.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          sourceBadgeId: null,
          OR: [{ createdById: 'instructor-1' }, { createdById: null }],
        },
        orderBy: { createdAt: 'desc' },
      })
    );

    const body = await response.json();
    expect(body).toEqual({
      count: 1,
      badges: [
        expect.objectContaining({
          id: 'badge-1',
          name: 'Bunsen Burner Badge',
          assignedStudentCount: 2,
          createdAt: '2025-02-20T17:00:00.000Z',
          requirements: [
            expect.objectContaining({
              displayText: 'Use the burner safely.',
            }),
          ],
        }),
      ],
    });
  });

  it('updates badge details and stores clean rubric metadata', async () => {
    const response = await patchBadge({
      id: 'badge-1',
      badgeName: 'Updated Badge',
      badgeDescription: 'Updated description',
      category: 'SAFETY',
      rubricItems: [{ text: 'First rubric item' }, { text: 'Second rubric item' }],
      checkpoints: [
        {
          title: 'Checkpoint 1',
          question: null,
          options: ['', '', '', ''],
          correctIndices: [0],
        },
      ],
    });

    expect(response.status).toBe(200);
    expect(mockPrisma.__tx.badge.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'badge-1', createdById: 'instructor-1' },
        data: expect.objectContaining({
          name: 'Updated Badge',
          description: 'Updated description',
          category: 'SAFETY',
        }),
      })
    );
    expect(mockPrisma.__tx.badgeRequirement.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'requirement-1' },
        data: {
          summary: expect.any(String),
        },
      })
    );

    const updateCall = mockPrisma.__tx.badgeRequirement.update.mock.calls[0][0];
    const storedSummary = JSON.parse(updateCall.data.summary);
    expect(storedSummary.rubricItems).toEqual([
      { number: 1, text: 'First rubric item' },
      { number: 2, text: 'Second rubric item' },
    ]);
    expect(storedSummary.checkpoints).toEqual([]);
  });
});
