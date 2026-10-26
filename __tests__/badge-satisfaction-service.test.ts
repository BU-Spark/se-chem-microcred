/** @jest-environment node */
import { BadgeRelationType, BadgeStatus, Prisma } from '@prisma/client';

import { syncBadgeRelations } from '../lib/badges/badge-relations.service';
import { reconcileSatisfiedBadges } from '../lib/badges/badge-satisfaction.service';

jest.mock('../lib/prisma', () => ({ __esModule: true, default: {} }));

const NOW = new Date('2026-10-19T12:00:00Z');

function buildDb() {
  return {
    badge: { findMany: jest.fn() },
    badgeRelation: {
      findMany: jest.fn(async (): Promise<unknown[]> => []),
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    badgeRequirement: { findMany: jest.fn(async (): Promise<unknown[]> => []) },
    studentBadge: {
      findMany: jest.fn(async (): Promise<unknown[]> => []),
      update: jest.fn(),
      create: jest.fn(),
    },
  };
}

type FakeDb = ReturnType<typeof buildDb>;
const asDb = (db: FakeDb) => db as unknown as Prisma.TransactionClient;

type RowInput = {
  badgeId: string;
  status: BadgeStatus;
  satisfiedByBadgeId?: string | null;
  satisfiedPriorStatus?: BadgeStatus | null;
};

// Course c1 holds Sprint, Run and Walk (copies of templates S, R and W). edges are
// SATISFIES arrows between the templates; rows are student s1's StudentBadges.
function setup(db: FakeDb, edges: Array<[string, string]>, rows: RowInput[]) {
  db.badgeRequirement.findMany.mockResolvedValue([
    { lessonId: 'l-s', lesson: { courseId: 'c1' }, badge: { id: 'sprint', name: 'Sprint', sourceBadgeId: 'S' } },
    { lessonId: 'l-r', lesson: { courseId: 'c1' }, badge: { id: 'run', name: 'Run', sourceBadgeId: 'R' } },
    { lessonId: 'l-w', lesson: { courseId: 'c1' }, badge: { id: 'walk', name: 'Walk', sourceBadgeId: 'W' } },
  ]);
  db.badgeRelation.findMany.mockResolvedValue(edges.map(([fromBadgeId, toBadgeId]) => ({ fromBadgeId, toBadgeId })));
  const fullRows = rows.map((row) => ({
    id: `sb-${row.badgeId}`,
    studentId: 's1',
    satisfiedByBadgeId: null,
    satisfiedPriorStatus: null,
    ...row,
  }));
  db.studentBadge.findMany
    .mockResolvedValueOnce(fullRows.map(() => ({ studentId: 's1' })))
    .mockResolvedValueOnce(fullRows);
}

const reconcile = (db: FakeDb) => reconcileSatisfiedBadges(asDb(db), { courseId: 'c1', studentIds: ['s1'], now: NOW });

describe('reconcileSatisfiedBadges', () => {
  it('completes Walk when Run is completed, remembering where Walk was', async () => {
    const db = buildDb();
    setup(
      db,
      [['R', 'W']],
      [
        { badgeId: 'run', status: BadgeStatus.COMPLETED },
        { badgeId: 'walk', status: BadgeStatus.IN_REVIEW },
      ]
    );

    await expect(reconcile(db)).resolves.toEqual({ awarded: 1, revoked: 0, repointed: 0 });
    expect(db.studentBadge.update).toHaveBeenCalledWith({
      where: { id: 'sb-walk' },
      data: {
        status: BadgeStatus.COMPLETED,
        awardedAt: NOW,
        satisfiedByBadgeId: 'run',
        satisfiedPriorStatus: BadgeStatus.IN_REVIEW,
      },
    });
  });

  it('creates the Walk row when the student never started it', async () => {
    const db = buildDb();
    setup(db, [['R', 'W']], [{ badgeId: 'run', status: BadgeStatus.COMPLETED }]);

    await reconcile(db);

    expect(db.studentBadge.create).toHaveBeenCalledWith({
      data: {
        studentId: 's1',
        badgeId: 'walk',
        status: BadgeStatus.COMPLETED,
        awardedAt: NOW,
        satisfiedByBadgeId: 'run',
        satisfiedPriorStatus: BadgeStatus.LEARNING,
      },
    });
  });

  it('completes a LOCKED Walk, and puts it back to LOCKED when Run is undone', async () => {
    const awardDb = buildDb();
    setup(
      awardDb,
      [['R', 'W']],
      [
        { badgeId: 'run', status: BadgeStatus.COMPLETED },
        { badgeId: 'walk', status: BadgeStatus.LOCKED },
      ]
    );
    await reconcile(awardDb);
    expect(awardDb.studentBadge.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: BadgeStatus.COMPLETED, satisfiedPriorStatus: BadgeStatus.LOCKED }),
      })
    );

    const revokeDb = buildDb();
    setup(
      revokeDb,
      [['R', 'W']],
      [
        { badgeId: 'run', status: BadgeStatus.READY_FOR_ASSESSMENT },
        {
          badgeId: 'walk',
          status: BadgeStatus.COMPLETED,
          satisfiedByBadgeId: 'run',
          satisfiedPriorStatus: BadgeStatus.LOCKED,
        },
      ]
    );
    await expect(reconcile(revokeDb)).resolves.toEqual({ awarded: 0, revoked: 1, repointed: 0 });
    expect(revokeDb.studentBadge.update).toHaveBeenCalledWith({
      where: { id: 'sb-walk' },
      data: { status: BadgeStatus.LOCKED, awardedAt: null, satisfiedByBadgeId: null, satisfiedPriorStatus: null },
    });
  });

  it('never touches a Walk the student completed themselves', async () => {
    const db = buildDb();
    setup(
      db,
      [['R', 'W']],
      [
        { badgeId: 'run', status: BadgeStatus.LEARNING },
        { badgeId: 'walk', status: BadgeStatus.COMPLETED },
      ]
    );

    await expect(reconcile(db)).resolves.toEqual({ awarded: 0, revoked: 0, repointed: 0 });
    expect(db.studentBadge.update).not.toHaveBeenCalled();
  });

  it('follows a chain: completing Sprint earns Run and Walk', async () => {
    const db = buildDb();
    setup(
      db,
      [
        ['S', 'R'],
        ['R', 'W'],
      ],
      [{ badgeId: 'sprint', status: BadgeStatus.COMPLETED }]
    );

    await expect(reconcile(db)).resolves.toEqual({ awarded: 2, revoked: 0, repointed: 0 });
    expect(db.studentBadge.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ badgeId: 'run', satisfiedByBadgeId: 'sprint' }),
    });
    expect(db.studentBadge.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ badgeId: 'walk', satisfiedByBadgeId: 'run' }),
    });
  });

  it('keeps Walk when Run is undone but Sprint still earns it', async () => {
    const db = buildDb();
    setup(
      db,
      [
        ['R', 'W'],
        ['S', 'W'],
      ],
      [
        { badgeId: 'sprint', status: BadgeStatus.COMPLETED },
        { badgeId: 'run', status: BadgeStatus.LEARNING },
        {
          badgeId: 'walk',
          status: BadgeStatus.COMPLETED,
          satisfiedByBadgeId: 'run',
          satisfiedPriorStatus: BadgeStatus.LEARNING,
        },
      ]
    );

    await expect(reconcile(db)).resolves.toEqual({ awarded: 0, revoked: 0, repointed: 1 });
    expect(db.studentBadge.update).toHaveBeenCalledWith({
      where: { id: 'sb-walk' },
      data: { satisfiedByBadgeId: 'sprint' },
    });
  });

  it('revokes awards once the relationship itself is removed', async () => {
    const db = buildDb();
    setup(
      db,
      [],
      [
        { badgeId: 'run', status: BadgeStatus.COMPLETED },
        {
          badgeId: 'walk',
          status: BadgeStatus.COMPLETED,
          satisfiedByBadgeId: 'run',
          satisfiedPriorStatus: BadgeStatus.LEARNING,
        },
      ]
    );

    await expect(reconcile(db)).resolves.toEqual({ awarded: 0, revoked: 1, repointed: 0 });
  });

  it('does nothing for a course without the badges', async () => {
    const db = buildDb();
    await expect(reconcile(db)).resolves.toEqual({ awarded: 0, revoked: 0, repointed: 0 });
    expect(db.studentBadge.findMany).not.toHaveBeenCalled();
  });
});

describe('syncBadgeRelations (SATISFIES)', () => {
  it('stores Run -> Walk as an outgoing arrow from the edited badge', async () => {
    const db = buildDb();
    db.badge.findMany
      .mockResolvedValueOnce([{ id: 'W', sourceBadgeId: null }])
      .mockResolvedValueOnce([{ id: 'W', name: 'Walk' }]);

    await expect(
      syncBadgeRelations(asDb(db), { rootId: 'R', editorId: 'u1', type: BadgeRelationType.SATISFIES, ids: ['W'] })
    ).resolves.toEqual({ added: ['W'], removed: [] });
    expect(db.badgeRelation.createMany).toHaveBeenCalledWith({
      data: [{ type: 'SATISFIES', fromBadgeId: 'R', toBadgeId: 'W' }],
      skipDuplicates: true,
    });
  });

  it('does not require the earned badge to be in the course', async () => {
    const db = buildDb();
    db.badge.findMany
      .mockResolvedValueOnce([{ id: 'W', sourceBadgeId: null }])
      .mockResolvedValueOnce([{ id: 'W', name: 'Walk' }]);

    await syncBadgeRelations(asDb(db), { rootId: 'R', editorId: 'u1', type: BadgeRelationType.SATISFIES, ids: ['W'] });

    // The prerequisite course-coverage check would read placements here.
    expect(db.badgeRequirement.findMany).not.toHaveBeenCalled();
  });

  it('rejects Walk earning Run when Run already earns Walk', async () => {
    const db = buildDb();
    db.badge.findMany
      .mockResolvedValueOnce([{ id: 'R', sourceBadgeId: null }])
      .mockResolvedValueOnce([{ id: 'R', name: 'Run' }]);
    db.badgeRelation.findMany.mockResolvedValueOnce([{ fromBadgeId: 'R', toBadgeId: 'W' }]);

    await expect(
      syncBadgeRelations(asDb(db), { rootId: 'W', editorId: 'u1', type: BadgeRelationType.SATISFIES, ids: ['R'] })
    ).rejects.toMatchObject({ status: 400, message: expect.stringContaining('Run already earns this badge') });
  });

  it('removes only the outgoing arrows that were dropped', async () => {
    const db = buildDb();
    db.badge.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    db.badgeRelation.findMany
      .mockResolvedValueOnce([{ fromBadgeId: 'R', toBadgeId: 'W' }])
      .mockResolvedValueOnce([{ fromBadgeId: 'R', toBadgeId: 'W' }]);

    await expect(
      syncBadgeRelations(asDb(db), { rootId: 'R', editorId: 'u1', type: BadgeRelationType.SATISFIES, ids: [] })
    ).resolves.toEqual({ added: [], removed: ['W'] });
    expect(db.badgeRelation.deleteMany).toHaveBeenCalledWith({
      where: { type: 'SATISFIES', fromBadgeId: 'R', toBadgeId: { in: ['W'] } },
    });
  });
});
