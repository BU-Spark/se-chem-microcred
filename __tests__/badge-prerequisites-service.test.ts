/** @jest-environment node */
import { BadgeStatus, Prisma } from '@prisma/client';

import {
  BadgePrerequisiteError,
  findCourseDependents,
  findLessonPrerequisiteLock,
  syncBadgePrerequisites,
} from '../lib/badges/badge-prerequisites.service';

function buildDb() {
  return {
    badge: { findMany: jest.fn() },
    badgeRelation: {
      findMany: jest.fn(async (): Promise<unknown[]> => []),
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    badgeRequirement: { findMany: jest.fn(async (): Promise<unknown[]> => []) },
    studentBadge: { findMany: jest.fn(async (): Promise<unknown[]> => []) },
    lessonProgress: { findMany: jest.fn(async (): Promise<unknown[]> => []) },
    lesson: { findUnique: jest.fn() },
  };
}

type FakeDb = ReturnType<typeof buildDb>;
const asDb = (db: FakeDb) => db as unknown as Prisma.TransactionClient;

// Course c1 holds copies of A and B; template B requires template A.
function courseWithAandB(db: FakeDb) {
  db.lesson.findUnique.mockResolvedValue({ courseId: 'c1', badgeRequirements: [{ badgeId: 'b-copy' }] });
  db.badgeRequirement.findMany.mockResolvedValue([
    { lessonId: 'lesson-b', lesson: { courseId: 'c1' }, badge: { id: 'b-copy', name: 'B', sourceBadgeId: 'B' } },
    { lessonId: 'lesson-a', lesson: { courseId: 'c1' }, badge: { id: 'a-copy', name: 'A', sourceBadgeId: 'A' } },
  ]);
  db.badgeRelation.findMany.mockResolvedValue([{ toBadgeId: 'B', fromBadge: { id: 'A', name: 'A' } }]);
}

describe('syncBadgePrerequisites', () => {
  it('leaves prerequisites untouched when the field is omitted', async () => {
    const db = buildDb();
    await syncBadgePrerequisites(asDb(db), { rootId: 'B', editorId: 'u1', prereqIds: undefined });
    expect(db.badge.findMany).not.toHaveBeenCalled();
    expect(db.badgeRelation.deleteMany).not.toHaveBeenCalled();
    expect(db.badgeRelation.createMany).not.toHaveBeenCalled();
  });

  it('rejects a prerequisite that would close a loop (A -> B -> C, then A requires C)', async () => {
    const db = buildDb();
    db.badge.findMany
      .mockResolvedValueOnce([{ id: 'C', sourceBadgeId: null }])
      .mockResolvedValueOnce([{ id: 'C', name: 'Badge C' }]);
    db.badgeRelation.findMany.mockResolvedValueOnce([
      { fromBadgeId: 'A', toBadgeId: 'B' },
      { fromBadgeId: 'B', toBadgeId: 'C' },
    ]);

    const result = syncBadgePrerequisites(asDb(db), { rootId: 'A', editorId: 'u1', prereqIds: ['C'] });
    await expect(result).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining('Badge C already requires'),
    });
    expect(db.badgeRelation.createMany).not.toHaveBeenCalled();
  });

  it('resolves a course copy to its template before storing the arrow', async () => {
    const db = buildDb();
    db.badge.findMany
      .mockResolvedValueOnce([{ id: 'a-copy', sourceBadgeId: 'A' }])
      .mockResolvedValueOnce([{ id: 'A', name: 'A' }]);

    await syncBadgePrerequisites(asDb(db), { rootId: 'B', editorId: 'u1', prereqIds: ['a-copy'] });

    expect(db.badgeRelation.createMany).toHaveBeenCalledWith({
      data: [{ type: 'PREREQUISITE', fromBadgeId: 'A', toBadgeId: 'B' }],
      skipDuplicates: true,
    });
  });

  it('blocks the save when a course using the badge lacks the new prerequisite', async () => {
    const db = buildDb();
    db.badge.findMany
      .mockResolvedValueOnce([{ id: 'A', sourceBadgeId: null }])
      .mockResolvedValueOnce([{ id: 'A', name: 'Gas Safety' }]);
    db.badgeRequirement.findMany
      // B is placed in CHEM 101...
      .mockResolvedValueOnce([{ lesson: { course: { id: 'c1', title: 'CHEM 101' } } }])
      // ...which holds only B.
      .mockResolvedValueOnce([
        { lessonId: 'lesson-b', lesson: { courseId: 'c1' }, badge: { id: 'b-copy', name: 'B', sourceBadgeId: 'B' } },
      ]);

    const error = await syncBadgePrerequisites(asDb(db), { rootId: 'B', editorId: 'u1', prereqIds: ['A'] }).catch(
      (caught) => caught
    );

    expect(error).toBeInstanceOf(BadgePrerequisiteError);
    expect(error.status).toBe(409);
    expect(error.message).toContain('Add Gas Safety to CHEM 101');
    expect(error.details).toEqual({
      courses: [{ courseId: 'c1', title: 'CHEM 101', missing: [{ id: 'A', name: 'Gas Safety' }] }],
    });
    expect(db.badgeRelation.createMany).not.toHaveBeenCalled();
  });

  it('only deletes removed arrows and only adds new ones', async () => {
    const db = buildDb();
    db.badge.findMany
      .mockResolvedValueOnce([{ id: 'A', sourceBadgeId: null }])
      .mockResolvedValueOnce([{ id: 'A', name: 'A' }]);
    db.badgeRelation.findMany
      .mockResolvedValueOnce([
        { fromBadgeId: 'A', toBadgeId: 'B' },
        { fromBadgeId: 'X', toBadgeId: 'B' },
      ])
      .mockResolvedValueOnce([{ fromBadgeId: 'A' }, { fromBadgeId: 'X' }]);

    await syncBadgePrerequisites(asDb(db), { rootId: 'B', editorId: 'u1', prereqIds: ['A'] });

    expect(db.badgeRelation.deleteMany).toHaveBeenCalledWith({
      where: { type: 'PREREQUISITE', toBadgeId: 'B', fromBadgeId: { in: ['X'] } },
    });
    expect(db.badgeRelation.createMany).not.toHaveBeenCalled();
  });

  it('rejects a badge outside the editor’s library', async () => {
    const db = buildDb();
    db.badge.findMany.mockResolvedValueOnce([{ id: 'P', sourceBadgeId: null }]).mockResolvedValueOnce([]);
    await expect(
      syncBadgePrerequisites(asDb(db), { rootId: 'B', editorId: 'u1', prereqIds: ['P'] })
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe('findLessonPrerequisiteLock', () => {
  it('locks a student who has not completed the prerequisite or started the badge', async () => {
    const db = buildDb();
    courseWithAandB(db);
    await expect(findLessonPrerequisiteLock(asDb(db), { studentId: 's1', lessonId: 'lesson-b' })).resolves.toEqual([
      { id: 'a-copy', name: 'A' },
    ]);
  });

  it('unlocks once the prerequisite is COMPLETED', async () => {
    const db = buildDb();
    courseWithAandB(db);
    db.studentBadge.findMany.mockResolvedValue([
      { badgeId: 'a-copy', status: BadgeStatus.COMPLETED, qevWaivedAt: null },
    ]);
    await expect(findLessonPrerequisiteLock(asDb(db), { studentId: 's1', lessonId: 'lesson-b' })).resolves.toBeNull();
  });

  it('does not count a prerequisite that is only IN_REVIEW', async () => {
    const db = buildDb();
    courseWithAandB(db);
    db.studentBadge.findMany.mockResolvedValue([
      { badgeId: 'a-copy', status: BadgeStatus.IN_REVIEW, qevWaivedAt: null },
    ]);
    await expect(findLessonPrerequisiteLock(asDb(db), { studentId: 's1', lessonId: 'lesson-b' })).resolves.toHaveLength(
      1
    );
  });

  it('grandfathers a student who already has progress on the badge', async () => {
    const db = buildDb();
    courseWithAandB(db);
    db.lessonProgress.findMany.mockResolvedValue([{ lessonId: 'lesson-b' }]);
    await expect(findLessonPrerequisiteLock(asDb(db), { studentId: 's1', lessonId: 'lesson-b' })).resolves.toBeNull();
  });

  it('grandfathers a student whose QEV was waived', async () => {
    const db = buildDb();
    courseWithAandB(db);
    db.studentBadge.findMany.mockResolvedValue([
      { badgeId: 'b-copy', status: BadgeStatus.LEARNING, qevWaivedAt: new Date() },
    ]);
    await expect(findLessonPrerequisiteLock(asDb(db), { studentId: 's1', lessonId: 'lesson-b' })).resolves.toBeNull();
  });

  it('leaves a badge with no prerequisites open', async () => {
    const db = buildDb();
    courseWithAandB(db);
    db.badgeRelation.findMany.mockResolvedValue([]);
    await expect(findLessonPrerequisiteLock(asDb(db), { studentId: 's1', lessonId: 'lesson-b' })).resolves.toBeNull();
    expect(db.studentBadge.findMany).not.toHaveBeenCalled();
  });
});

describe('findCourseDependents', () => {
  it('names the course badges that require the one being unassigned', async () => {
    const db = buildDb();
    courseWithAandB(db);
    db.badgeRelation.findMany.mockResolvedValue([{ toBadgeId: 'B' }]);
    await expect(findCourseDependents(asDb(db), 'c1', 'A')).resolves.toEqual([{ id: 'b-copy', name: 'B' }]);
  });

  it('ignores dependents that live in other courses', async () => {
    const db = buildDb();
    courseWithAandB(db);
    db.badgeRelation.findMany.mockResolvedValue([{ toBadgeId: 'Z' }]);
    await expect(findCourseDependents(asDb(db), 'c1', 'A')).resolves.toEqual([]);
  });
});
