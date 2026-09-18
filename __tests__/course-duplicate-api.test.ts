/** @jest-environment node */

import { NextRequest } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
import { CourseContactType, CourseRole } from '@prisma/client';

import { POST } from '../app/api/courses/[courseId]/duplicate/route';
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
    studentAnalytics: {
      createMany: jest.fn(),
    },
  },
}));

// A minimal in-memory fake of the Prisma model API (createMany + findMany
// with `in`/equality where-filters) so the batched createMany + read-back
// idiom used by the duplicate route can run against something realistic.
function makeFakeModel(prefix: string) {
  const rows: Record<string, unknown>[] = [];
  let counter = 0;
  return {
    rows,
    createMany: jest.fn(async ({ data }: { data: Record<string, unknown>[] }) => {
      for (const row of data) {
        rows.push({ id: `${prefix}-${++counter}`, ...row });
      }
      return { count: data.length };
    }),
    findMany: jest.fn(
      async ({ where, select }: { where?: Record<string, unknown>; select?: Record<string, boolean> }) => {
        let filtered = rows;
        if (where) {
          for (const [key, cond] of Object.entries(where)) {
            if (cond && typeof cond === 'object' && 'in' in (cond as Record<string, unknown>)) {
              const allowed = (cond as { in: unknown[] }).in;
              filtered = filtered.filter((row) => allowed.includes(row[key]));
            } else {
              filtered = filtered.filter((row) => row[key] === cond);
            }
          }
        }
        if (select) {
          return filtered.map((row) => {
            const out: Record<string, unknown> = {};
            for (const key of Object.keys(select)) out[key] = row[key];
            return out;
          });
        }
        return filtered;
      }
    ),
  };
}

const mockCurrentUser = currentUser as jest.MockedFunction<typeof currentUser>;
const mockPrisma = prisma as unknown as {
  user: { findUnique: jest.Mock };
  $transaction: jest.Mock;
  studentAnalytics: { createMany: jest.Mock };
};

function duplicateCourse(courseId = 'source-course-1') {
  return POST(new NextRequest(`http://localhost/api/courses/${courseId}/duplicate`, { method: 'POST' }), {
    params: Promise.resolve({ courseId }),
  });
}

describe('POST /api/courses/[courseId]/duplicate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCurrentUser.mockResolvedValue({
      emailAddresses: [{ emailAddress: 'prof@example.edu' }],
    } as Awaited<ReturnType<typeof currentUser>>);
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'creator-1' });
  });

  it('does not copy checker contacts into the duplicated course', async () => {
    const tx = {
      course: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'source-course-1',
          title: 'Original Course',
          sectionCount: 2,
          description: 'Source description',
          settings: {
            allowCooldownOverride: true,
            allowCheckerMessages: true,
            allowCrossSectionView: false,
          },
          contacts: [
            {
              id: 'contact-1',
              type: CourseContactType.CHECKER,
              name: 'David Xiao',
              email: 'david.xiao@example.edu',
              avatarUrl: null,
            },
          ],
          lessons: [],
        }),
        create: jest.fn().mockResolvedValue({ id: 'copy-course-1', title: 'Copy of Original Course' }),
      },
      enrollment: {
        create: jest.fn().mockResolvedValue({ id: 'creator-enrollment-1' }),
      },
      courseContact: {
        createMany: jest.fn(),
      },
    };

    mockPrisma.$transaction.mockImplementation(async (callback) => callback(tx));
    mockPrisma.studentAnalytics.createMany.mockResolvedValue({ count: 1 });

    const response = await duplicateCourse();
    if (!response) throw new Error('Expected a response from duplicateCourse');

    expect(response.status).toBe(201);
    expect(tx.courseContact.createMany).not.toHaveBeenCalled();
    expect(tx.enrollment.create).toHaveBeenCalledWith({
      data: {
        studentId: 'creator-1',
        courseId: 'copy-course-1',
        role: CourseRole.INSTRUCTOR,
      },
    });
  });

  it('copies full badge fields (incl. dates) and the entire rubric tree', async () => {
    const sourceBadge = {
      id: 'badge-source-1',
      slug: 'chem-safety',
      name: 'Chemical Safety',
      description: 'Lab safety badge',
      imageUrl: 'https://example.com/badge.png',
      imagePositionX: 40,
      imagePositionY: 60,
      imageScale: 120,
      availableOn: new Date('2026-01-01T00:00:00.000Z'),
      closesOn: new Date('2026-06-01T00:00:00.000Z'),
      neverCloses: false,
      reassessmentLimit: 2,
      cooldownDays: 7,
      reassessmentRequired: true,
      sourceBadgeId: null,
      surveys: [],
      rubricGoal: {
        id: 'goal-source-1',
        name: 'Demonstrate safe lab practice',
        instructions: 'Watch the student handle glassware.',
        subgoals: [
          {
            id: 'subgoal-source-1',
            text: 'Uses PPE correctly',
            passThreshold: 2,
            sortOrder: 0,
            tasks: [
              { id: 'task-source-1', text: 'Wears goggles', points: 1, sortOrder: 0 },
              { id: 'task-source-2', text: 'Wears gloves', points: 1, sortOrder: 1 },
            ],
          },
        ],
      },
    };

    const sourceLesson = {
      id: 'lesson-source-1',
      slug: 'intro-lesson',
      title: 'Intro',
      summary: null,
      description: null,
      thumbnailUrl: null,
      estimatedMinutes: 10,
      dueDate: new Date('2026-02-01T00:00:00.000Z'),
      passingPercent: 80,
      sortOrder: 0,
      segments: [],
      skills: [],
      checkpoints: [],
      badgeRequirements: [{ badgeId: 'badge-source-1', badge: sourceBadge, summary: null }],
    };

    const tx = {
      course: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'source-course-1',
          title: 'Original Course',
          sectionCount: 1,
          description: null,
          settings: { allowCooldownOverride: false, allowCheckerMessages: false, allowCrossSectionView: false },
          lessons: [sourceLesson],
        }),
        create: jest.fn().mockResolvedValue({ id: 'copy-course-1', title: 'Copy of Original Course' }),
      },
      enrollment: { create: jest.fn().mockResolvedValue({ id: 'creator-enrollment-1' }) },
      lesson: makeFakeModel('lesson'),
      lessonSegment: makeFakeModel('segment'),
      lessonSkill: makeFakeModel('skill'),
      lessonCheckpoint: makeFakeModel('checkpoint'),
      checkpointQuestion: makeFakeModel('question'),
      badge: makeFakeModel('badge'),
      rubricGoal: makeFakeModel('goal'),
      rubricSubgoal: makeFakeModel('subgoal'),
      rubricTask: makeFakeModel('task'),
      surveyPrompt: makeFakeModel('survey'),
      badgeRequirement: makeFakeModel('requirement'),
      courseContact: { createMany: jest.fn() },
    };

    mockPrisma.$transaction.mockImplementation(async (callback) => callback(tx));
    mockPrisma.studentAnalytics.createMany.mockResolvedValue({ count: 1 });

    const response = await duplicateCourse();
    if (!response) throw new Error('Expected a response from duplicateCourse');

    expect(response.status).toBe(201);

    const newBadge = tx.badge.rows[0] as typeof sourceBadge & { id: string };
    expect(newBadge).toMatchObject({
      slug: expect.stringContaining('chem-safety-'),
      name: sourceBadge.name,
      description: sourceBadge.description,
      imageUrl: sourceBadge.imageUrl,
      imagePositionX: sourceBadge.imagePositionX,
      imagePositionY: sourceBadge.imagePositionY,
      imageScale: sourceBadge.imageScale,
      availableOn: sourceBadge.availableOn,
      closesOn: sourceBadge.closesOn,
      neverCloses: sourceBadge.neverCloses,
      reassessmentLimit: sourceBadge.reassessmentLimit,
      cooldownDays: sourceBadge.cooldownDays,
      reassessmentRequired: sourceBadge.reassessmentRequired,
    });
    expect(newBadge.id).not.toBe(sourceBadge.id);

    const newGoal = tx.rubricGoal.rows[0] as { id: string; badgeId: string; name: string; instructions: string };
    expect(newGoal.badgeId).toBe(newBadge.id);
    expect(newGoal.name).toBe(sourceBadge.rubricGoal.name);
    expect(newGoal.instructions).toBe(sourceBadge.rubricGoal.instructions);

    const newSubgoal = tx.rubricSubgoal.rows[0] as {
      id: string;
      goalId: string;
      text: string;
      passThreshold: number;
      sortOrder: number;
    };
    expect(newSubgoal.goalId).toBe(newGoal.id);
    expect(newSubgoal.text).toBe(sourceBadge.rubricGoal.subgoals[0].text);
    expect(newSubgoal.passThreshold).toBe(sourceBadge.rubricGoal.subgoals[0].passThreshold);

    expect(tx.rubricTask.rows).toHaveLength(2);
    for (const task of tx.rubricTask.rows as { subgoalId: string; text: string; points: number }[]) {
      expect(task.subgoalId).toBe(newSubgoal.id);
    }
    expect((tx.rubricTask.rows as { text: string }[]).map((t) => t.text)).toEqual(
      sourceBadge.rubricGoal.subgoals[0].tasks.map((t) => t.text)
    );

    // Lesson due date still carries over verbatim (the frontend surfaces the
    // "review dates" modal to prompt the instructor to update it).
    expect((tx.lesson.rows[0] as { dueDate: Date }).dueDate).toBe(sourceLesson.dueDate);
  });
});
