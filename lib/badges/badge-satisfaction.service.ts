import { BadgeRelationType, BadgeStatus, Prisma } from '@prisma/client';

import prisma from '@/lib/prisma';
import { resolveSatisfiedBadges } from '@/lib/badgeRelations';
import { loadCourseBadges } from '@/lib/badges/badge-relations.service';

// SATISFIES: completing Run earns Walk, in the same course only.
//
// "Earned through another badge" is derived state, so every trigger (a badge
// finalized, an instructor override or reset, an edge added or removed, a badge
// imported) runs this one idempotent reconcile instead of patching rows event by
// event. It awards what the student's own completions now imply and revokes awards
// that are no longer backed, restoring the status the badge had before.
//
// A badge the student completed themselves (satisfiedByBadgeId = null) is never
// touched.

type Db = Prisma.TransactionClient;

export type ReconcileResult = { awarded: number; revoked: number; repointed: number };

type Row = {
  id: string;
  studentId: string;
  badgeId: string;
  status: BadgeStatus;
  satisfiedByBadgeId: string | null;
  satisfiedPriorStatus: BadgeStatus | null;
};

const ROW_SELECT = {
  id: true,
  studentId: true,
  badgeId: true,
  status: true,
  satisfiedByBadgeId: true,
  satisfiedPriorStatus: true,
} as const;

export async function reconcileSatisfiedBadges(
  db: Db,
  { courseId, studentIds, now = new Date() }: { courseId: string; studentIds?: string[]; now?: Date }
): Promise<ReconcileResult> {
  const result: ReconcileResult = { awarded: 0, revoked: 0, repointed: 0 };
  if (studentIds?.length === 0) return result;

  const courseBadges = (await loadCourseBadges(db, [courseId])).get(courseId);
  if (!courseBadges || courseBadges.size === 0) return result;

  const rootByCopy = new Map([...courseBadges.values()].map((badge) => [badge.badgeId, badge.rootId]));
  const copyIds = [...rootByCopy.keys()];
  const roots = [...courseBadges.keys()];

  const edges = await db.badgeRelation.findMany({
    where: { type: BadgeRelationType.SATISFIES, fromBadgeId: { in: roots }, toBadgeId: { in: roots } },
    orderBy: { createdAt: 'asc' },
    select: { fromBadgeId: true, toBadgeId: true },
  });

  // Only students with a completion (something that could award) or an existing
  // award (something that could need revoking) can change.
  const studentFilter = studentIds ? { studentId: { in: studentIds } } : {};
  const candidates = await db.studentBadge.findMany({
    where: {
      badgeId: { in: copyIds },
      ...studentFilter,
      OR: [...(edges.length > 0 ? [{ status: BadgeStatus.COMPLETED }] : []), { satisfiedByBadgeId: { not: null } }],
    },
    select: { studentId: true },
  });
  const affectedStudents = [...new Set(candidates.map((row) => row.studentId))];
  if (affectedStudents.length === 0) return result;

  const rows: Row[] = await db.studentBadge.findMany({
    where: { badgeId: { in: copyIds }, studentId: { in: affectedStudents } },
    select: ROW_SELECT,
  });
  const rowsByStudent = new Map<string, Map<string, Row>>();
  for (const row of rows) {
    const byRoot = rowsByStudent.get(row.studentId) ?? new Map<string, Row>();
    byRoot.set(rootByCopy.get(row.badgeId) as string, row);
    rowsByStudent.set(row.studentId, byRoot);
  }

  for (const studentId of affectedStudents) {
    const byRoot = rowsByStudent.get(studentId) ?? new Map<string, Row>();
    const ownCompleted = [...byRoot.entries()]
      .filter(([, row]) => row.status === BadgeStatus.COMPLETED && row.satisfiedByBadgeId === null)
      .map(([rootId]) => rootId);
    const desired = resolveSatisfiedBadges(edges, ownCompleted);

    // Revoke or repoint the awards this student already holds.
    for (const [rootId, row] of byRoot) {
      if (row.satisfiedByBadgeId === null) continue;
      const sourceRoot = desired.get(rootId);
      if (!sourceRoot) {
        await db.studentBadge.update({
          where: { id: row.id },
          data: {
            status: row.satisfiedPriorStatus ?? BadgeStatus.LEARNING,
            awardedAt: null,
            satisfiedByBadgeId: null,
            satisfiedPriorStatus: null,
          },
        });
        result.revoked += 1;
        continue;
      }
      const sourceCopy = courseBadges.get(sourceRoot)?.badgeId as string;
      if (sourceCopy !== row.satisfiedByBadgeId) {
        await db.studentBadge.update({ where: { id: row.id }, data: { satisfiedByBadgeId: sourceCopy } });
        result.repointed += 1;
      }
    }

    // Award what is newly implied. In-progress, in-review and even LOCKED badges
    // are completed: the source badge proves the skill. Attempt history stays put
    // and the prior status comes back if the award is ever revoked.
    for (const [rootId, sourceRoot] of desired) {
      const row = byRoot.get(rootId);
      if (row?.satisfiedByBadgeId) continue;
      const badgeId = courseBadges.get(rootId)?.badgeId as string;
      const satisfiedByBadgeId = courseBadges.get(sourceRoot)?.badgeId as string;

      if (row) {
        await db.studentBadge.update({
          where: { id: row.id },
          data: {
            status: BadgeStatus.COMPLETED,
            awardedAt: now,
            satisfiedByBadgeId,
            satisfiedPriorStatus: row.status,
          },
        });
      } else {
        await db.studentBadge.create({
          data: {
            studentId,
            badgeId,
            status: BadgeStatus.COMPLETED,
            awardedAt: now,
            satisfiedByBadgeId,
            satisfiedPriorStatus: BadgeStatus.LEARNING,
          },
        });
      }
      result.awarded += 1;
    }
  }

  return result;
}

// Every course holding a copy of any of these badge families. Used after a
// SATISFIES edge changes, since one template edit can affect many courses.
export async function findCoursesWithFamilies(db: Db, rootIds: string[]) {
  if (rootIds.length === 0) return [];
  const placements = await db.badgeRequirement.findMany({
    where: {
      badge: { OR: [{ id: { in: rootIds } }, { sourceBadgeId: { in: rootIds } }] },
      lesson: { isNot: null },
    },
    select: { lesson: { select: { courseId: true } } },
  });
  return [...new Set(placements.flatMap((placement) => (placement.lesson ? [placement.lesson.courseId] : [])))];
}

// Re-award whole courses, one transaction per course so a big roster can't push a
// single transaction past Accelerate's 15s cap. Runs after the triggering change
// commits; a failure is reported, not rolled back, and the affected students are
// healed by their next reconcile.
export async function reconcileCourses(courseIds: string[]) {
  const failedCourseIds: string[] = [];
  for (const courseId of courseIds) {
    try {
      await prisma.$transaction((tx) => reconcileSatisfiedBadges(tx, { courseId }), { maxWait: 5000, timeout: 15000 });
    } catch (error) {
      console.error(`Reconciling satisfied badges for course ${courseId} failed:`, error);
      failedCourseIds.push(courseId);
    }
  }
  return { courseIds, failedCourseIds };
}

// After a template's SATISFIES edges change: every course using that family.
export async function reconcileCoursesForFamilies(rootIds: string[]) {
  return reconcileCourses(await findCoursesWithFamilies(prisma, rootIds));
}

// For callers that know only the badge (the student finalize route): resolves the
// course copy's course, then reconciles just this student there.
export async function reconcileStudentBadgeCourse(
  db: Db,
  { studentId, badgeId }: { studentId: string; badgeId: string }
) {
  const requirement = await db.badgeRequirement.findFirst({
    where: { badgeId, lesson: { isNot: null } },
    select: { lesson: { select: { courseId: true } } },
  });
  if (!requirement?.lesson) return { awarded: 0, revoked: 0, repointed: 0 };
  return reconcileSatisfiedBadges(db, { courseId: requirement.lesson.courseId, studentIds: [studentId] });
}
