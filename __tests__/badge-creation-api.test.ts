/** @jest-environment node */

import { NextRequest } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';

jest.mock('@clerk/nextjs/server', () => ({
  currentUser: jest.fn(),
}));

const mockTx = {
  course: { findFirst: jest.fn() },
  badge: { create: jest.fn(), update: jest.fn(), updateMany: jest.fn(), findMany: jest.fn() },
  lesson: { create: jest.fn(), updateMany: jest.fn() },
  lessonSkill: { createMany: jest.fn(), deleteMany: jest.fn() },
  lessonSegment: { create: jest.fn(), findMany: jest.fn(), updateMany: jest.fn() },
  lessonCheckpoint: { createMany: jest.fn(), findMany: jest.fn(), upsert: jest.fn() },
  checkpointQuestion: { createMany: jest.fn(), upsert: jest.fn() },
  badgeRequirement: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  surveyPrompt: { create: jest.fn() },
  studentBadge: { createMany: jest.fn() },
  rubricGoal: { upsert: jest.fn(), deleteMany: jest.fn() },
  rubricSubgoal: { createMany: jest.fn(), deleteMany: jest.fn() },
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
  return (await GET(new NextRequest('http://localhost/api/badges'))) as Response;
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
    mockPrisma.__tx.lessonSkill.createMany.mockResolvedValue({ count: 2 });
    mockPrisma.__tx.lessonSkill.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.__tx.lessonSegment.create.mockResolvedValue({ id: 'segment-1' });
    mockPrisma.__tx.lessonSegment.findMany.mockResolvedValue([]);
    mockPrisma.__tx.lessonCheckpoint.createMany.mockResolvedValue({ count: 2 });
    mockPrisma.__tx.lessonCheckpoint.findMany.mockResolvedValue([
      { id: 'checkpoint-1', sortOrder: 0 },
      { id: 'checkpoint-2', sortOrder: 1 },
    ]);
    mockPrisma.__tx.lessonCheckpoint.upsert.mockResolvedValue({ id: 'checkpoint-1' });
    mockPrisma.__tx.checkpointQuestion.createMany.mockResolvedValue({ count: 2 });
    mockPrisma.__tx.checkpointQuestion.upsert.mockResolvedValue({ id: 'question-1' });
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
    mockPrisma.__tx.badgeRequirement.findMany.mockResolvedValue([{ lessonId: 'lesson-1' }]);
    mockPrisma.__tx.badge.findMany.mockResolvedValue([]);
    mockPrisma.__tx.rubricGoal.upsert.mockResolvedValue({ id: 'goal-1' });
    mockPrisma.__tx.rubricGoal.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.__tx.rubricSubgoal.createMany.mockResolvedValue({ count: 1 });
    mockPrisma.__tx.rubricSubgoal.deleteMany.mockResolvedValue({ count: 0 });
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
      youtubeUrl: 'https://www.youtube.com/shorts/abc123def45',
      videoTitle: 'Burner lesson',
      videoLength: '00:20:00',
      skills: ['Inspect setup', 'Control flame'],
      checkpoints: [
        {
          title: 'Checkpoint 1',
          time: '00:03:00',
          points: 5,
          question: 'What should you check first?',
          options: ['Gas off', 'Gas on'],
          correctIndices: [0, 1],
          questions: [
            {
              question: 'What should you check first?',
              options: ['Gas off', 'Gas on'],
              correctIndices: [0, 1],
            },
            {
              question: 'What color should a steady flame be?',
              options: ['Orange', 'Blue', 'Yellow'],
              correctIndices: [1],
            },
          ],
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
      rubricGoal: {
        name: 'Operate the burner safely',
        passThreshold: 3,
        subgoals: [
          { text: 'Safe setup', points: 2 },
          { text: 'Safe shutdown', points: 2 },
        ],
      },
    });

    expect(response.status).toBe(201);
    expect(mockPrisma.__tx.rubricGoal.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { badgeId: 'source-badge-1' },
        create: { badgeId: 'source-badge-1', name: 'Operate the burner safely', totalPoints: 4, passThreshold: 3 },
      })
    );
    expect(mockPrisma.__tx.rubricGoal.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { badgeId: 'course-badge-1' },
        create: { badgeId: 'course-badge-1', name: 'Operate the burner safely', totalPoints: 4, passThreshold: 3 },
      })
    );
    expect(mockPrisma.__tx.rubricSubgoal.createMany).toHaveBeenCalledWith({
      data: [
        { text: 'Safe setup', points: 2, sortOrder: 0, goalId: 'goal-1' },
        { text: 'Safe shutdown', points: 2, sortOrder: 1, goalId: 'goal-1' },
      ],
    });
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
    expect(mockPrisma.__tx.lesson.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: 'Bunsen Burner',
        }),
      })
    );
    expect(mockPrisma.__tx.lessonSegment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: 'Burner lesson',
          videoUrl: 'https://www.youtube.com/shorts/abc123def45',
          thumbnailUrl: 'https://i.ytimg.com/vi/abc123def45/hqdefault.jpg',
        }),
      })
    );
    expect(mockPrisma.__tx.lessonSkill.createMany).toHaveBeenCalledWith({
      data: [
        { lessonId: 'lesson-1', sortOrder: 0, text: 'Inspect setup' },
        { lessonId: 'lesson-1', sortOrder: 1, text: 'Control flame' },
      ],
    });
    expect(mockPrisma.__tx.lessonCheckpoint.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          label: 'Checkpoint',
          meta: '2 questions',
          questionCount: 2,
        }),
      ]),
    });
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
          checkpointId: 'checkpoint-1',
          sortOrder: 1,
          prompt: 'What color should a steady flame be?',
          options: {
            type: 'multipleChoice',
            options: ['Orange', 'Blue', 'Yellow'],
            correctIndices: [1],
          },
          correctIndex: 1,
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

  it('persists a custom passing threshold to the lesson row and the requirement summary', async () => {
    mockPrisma.__tx.badge.create
      .mockResolvedValueOnce({ id: 'source-badge-1', slug: 's', name: 'B', description: null, category: null })
      .mockResolvedValueOnce({ id: 'course-badge-1', slug: 'c', name: 'B', description: null, category: null });

    const response = await postBadge({
      courseId: 'course-1',
      badgeName: 'Threshold Badge',
      passingPercent: 55,
      rubricGoal: { name: 'Goal', subgoals: [{ text: 'Does the thing', points: 1 }] },
    });

    expect(response.status).toBe(201);
    // The lesson row (course copy) gets the chosen threshold instead of the schema default of 70.
    expect(mockPrisma.__tx.lesson.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ passingPercent: 55 }) })
    );
    // The source badge has no lesson row, so the threshold must round-trip via the summary JSON.
    const sourceSummary = JSON.parse(mockPrisma.__tx.badgeRequirement.create.mock.calls[0][0].data.summary);
    expect(sourceSummary.passingPercent).toBe(55);
  });

  it('clamps and defaults the passing threshold server-side', async () => {
    mockPrisma.__tx.badge.create
      .mockResolvedValueOnce({ id: 'source-badge-1', slug: 's', name: 'B', description: null, category: null })
      .mockResolvedValueOnce({ id: 'course-badge-1', slug: 'c', name: 'B', description: null, category: null });

    // Out-of-range value is clamped to 100; an omitted value would default to 70.
    const response = await postBadge({
      courseId: 'course-1',
      badgeName: 'Threshold Badge',
      passingPercent: 250,
      rubricGoal: { name: 'Goal', subgoals: [{ text: 'Does the thing', points: 1 }] },
    });

    expect(response.status).toBe(201);
    expect(mockPrisma.__tx.lesson.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ passingPercent: 100 }) })
    );
  });

  it('creates an independent badge when course id is missing', async () => {
    const response = await postBadge({
      badgeName: 'Independent Badge',
      badgeDescription: 'Reusable credential',
      rubricGoal: {
        name: 'Demonstrate the skill',
        subgoals: [{ text: 'Student demonstrates the skill.', points: 1 }],
      },
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
        rubricGoal: {
          id: 'goal-1',
          name: 'Use the burner safely.',
          totalPoints: 4,
          passThreshold: 3,
          subgoals: [{ id: 'subgoal-1', text: 'Light the burner correctly.', points: 4, sortOrder: 0 }],
        },
        requirements: [
          {
            id: 'requirement-1',
            summary: JSON.stringify({
              skills: [],
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
          rubricGoal: expect.objectContaining({
            name: 'Use the burner safely.',
            totalPoints: 4,
            passThreshold: 3,
            subgoals: [expect.objectContaining({ text: 'Light the burner correctly.', points: 4 })],
          }),
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
      skills: ['Updated skill'],
      passingPercent: 65,
      rubricGoal: {
        name: 'Updated goal',
        passThreshold: 2,
        subgoals: [
          { text: 'First subgoal', points: 1 },
          { text: 'Second subgoal', points: 2 },
        ],
      },
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
    expect(mockPrisma.__tx.badge.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [{ id: 'badge-1' }, { sourceBadgeId: 'badge-1' }],
          NOT: { id: 'badge-1' },
        },
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
    expect(storedSummary.lessonTitle).toBe('Updated Badge');
    // The edited threshold round-trips through the summary and updates the lesson row.
    expect(storedSummary.passingPercent).toBe(65);
    // The rubric moved to the RubricGoal/RubricSubgoal tables in version 3.
    expect(storedSummary.version).toBe(3);
    expect(storedSummary.rubricItems).toBeUndefined();
    expect(storedSummary.gradingCriteria).toBeUndefined();
    expect(storedSummary.checkpoints).toEqual([]);
    expect(mockPrisma.__tx.rubricGoal.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { badgeId: 'badge-1' },
        update: { name: 'Updated goal', totalPoints: 3, passThreshold: 2 },
      })
    );
    expect(mockPrisma.__tx.rubricSubgoal.deleteMany).toHaveBeenCalledWith({ where: { goalId: 'goal-1' } });
    expect(mockPrisma.__tx.rubricSubgoal.createMany).toHaveBeenCalledWith({
      data: [
        { text: 'First subgoal', points: 1, sortOrder: 0, goalId: 'goal-1' },
        { text: 'Second subgoal', points: 2, sortOrder: 1, goalId: 'goal-1' },
      ],
    });
    expect(mockPrisma.__tx.lesson.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: 'Updated Badge',
          passingPercent: 65,
        }),
      })
    );
    expect(mockPrisma.__tx.lessonSkill.deleteMany).toHaveBeenCalledWith({
      where: { lessonId: { in: ['lesson-1'] } },
    });
    expect(mockPrisma.__tx.lessonSkill.createMany).toHaveBeenCalledWith({
      data: [{ lessonId: 'lesson-1', sortOrder: 0, text: 'Updated skill' }],
    });
  });

  it('syncs a course copy owned by a different instructor when the source badge is edited', async () => {
    // badge-1 is the source badge being edited; course-copy-1 is a copy of it
    // imported into another instructor's course (createdById differs from the editor).
    mockPrisma.__tx.badge.findMany.mockResolvedValue([{ id: 'course-copy-1' }]);
    mockPrisma.__tx.badgeRequirement.findMany.mockResolvedValue([{ lessonId: 'lesson-1' }, { lessonId: 'lesson-2' }]);

    const response = await patchBadge({
      id: 'badge-1',
      badgeName: 'Updated Badge',
      badgeDescription: 'Updated description',
      category: 'SAFETY',
    });

    expect(response.status).toBe(200);
    expect(mockPrisma.__tx.badge.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [{ id: 'badge-1' }, { sourceBadgeId: 'badge-1' }],
          NOT: { id: 'badge-1' },
        },
      })
    );
    expect(mockPrisma.__tx.badge.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [{ id: 'badge-1' }, { sourceBadgeId: 'badge-1' }],
          NOT: { id: 'badge-1' },
        },
      })
    );
    expect(mockPrisma.__tx.badgeRequirement.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { badgeId: { in: ['course-copy-1'] } },
      })
    );
    // No rubricGoal in the payload => the rubric is removed across the family.
    expect(mockPrisma.__tx.rubricGoal.deleteMany).toHaveBeenCalledWith({ where: { badgeId: 'badge-1' } });
    expect(mockPrisma.__tx.rubricGoal.deleteMany).toHaveBeenCalledWith({ where: { badgeId: 'course-copy-1' } });
  });

  it('syncs edited checkpoint questions into lesson question rows', async () => {
    const response = await patchBadge({
      id: 'badge-1',
      badgeName: 'Updated Badge',
      badgeDescription: 'Updated description',
      category: 'SAFETY',
      checkpoints: [
        {
          title: 'Checkpoint 1',
          time: '00:02:00',
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
    });

    expect(response.status).toBe(200);
    expect(mockPrisma.__tx.lessonCheckpoint.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          lessonId_sortOrder: {
            lessonId: 'lesson-1',
            sortOrder: 0,
          },
        },
        create: expect.objectContaining({
          questionCount: 2,
          meta: '2 questions',
        }),
        update: expect.objectContaining({
          questionCount: 2,
          meta: '2 questions',
        }),
      })
    );
    expect(mockPrisma.__tx.checkpointQuestion.upsert).toHaveBeenCalledTimes(2);
    expect(mockPrisma.__tx.checkpointQuestion.upsert).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: {
          checkpointId_sortOrder: {
            checkpointId: 'checkpoint-1',
            sortOrder: 1,
          },
        },
        create: expect.objectContaining({
          prompt: 'Second question?',
          options: {
            type: 'multipleChoice',
            options: ['Red', 'Blue'],
            correctIndices: [1],
          },
          correctIndex: 1,
        }),
      })
    );
  });
});
