import { BadgeRelationType, BadgeStatus, Prisma } from '@prisma/client';

import {
  BadgeEdge,
  formatBadgeNameList,
  isPrerequisiteLocked,
  validatePrerequisiteSet,
} from '@/lib/badgePrerequisites';

// Prerequisite arrows live between badge family roots (templates). A course never
// stores its own arrows: its copy of B requires its copy of A because both share
// roots joined by an arrow. Invariant kept by import, wizard save and unassign: a
// course always contains every direct prerequisite of each of its badges.

// PrismaClient is assignable to TransactionClient, so these accept either.
type Db = Prisma.TransactionClient;

export type BadgeRef = { id: string; name: string };

export type CourseMissingPrereqs = {
  courseId: string;
  title: string;
  missing: BadgeRef[];
};

export type PrerequisiteStatus = {
  requires: BadgeRef[];
  unmet: BadgeRef[];
  started: boolean;
  locked: boolean;
};

// Thrown inside a transaction so the whole save rolls back; routes turn it into
// a JSON error with the extra detail (e.g. which courses block the save).
export class BadgePrerequisiteError extends Error {
  status: number;
  details?: Record<string, unknown>;

  constructor(message: string, status: number, details?: Record<string, unknown>) {
    super(message);
    this.name = 'BadgePrerequisiteError';
    this.status = status;
    this.details = details;
  }
}

export function resolveFamilyRootId(badge: { id: string; sourceBadgeId: string | null }) {
  return badge.sourceBadgeId ?? badge.id;
}

export async function loadPrerequisiteEdges(db: Db): Promise<BadgeEdge[]> {
  return db.badgeRelation.findMany({
    where: { type: BadgeRelationType.PREREQUISITE },
    select: { fromBadgeId: true, toBadgeId: true },
  });
}

// Prerequisites of each root, in a stable order.
export async function loadPrerequisitesByRoot(db: Db, rootIds: string[]) {
  const byRoot = new Map<string, BadgeRef[]>();
  if (rootIds.length === 0) return byRoot;

  const relations = await db.badgeRelation.findMany({
    where: { type: BadgeRelationType.PREREQUISITE, toBadgeId: { in: rootIds } },
    orderBy: { createdAt: 'asc' },
    select: { toBadgeId: true, fromBadge: { select: { id: true, name: true } } },
  });

  for (const relation of relations) {
    const list = byRoot.get(relation.toBadgeId) ?? [];
    list.push(relation.fromBadge);
    byRoot.set(relation.toBadgeId, list);
  }
  return byRoot;
}

type CourseBadge = { badgeId: string; rootId: string; name: string; lessonIds: string[] };

// Each course's badges keyed by family root. Course membership is
// Badge -> BadgeRequirement -> Lesson.courseId, as everywhere else.
async function loadCourseBadges(db: Db, courseIds: string[]) {
  const byCourse = new Map<string, Map<string, CourseBadge>>();
  if (courseIds.length === 0) return byCourse;

  const requirements = await db.badgeRequirement.findMany({
    where: { lesson: { courseId: { in: courseIds } } },
    select: {
      lessonId: true,
      lesson: { select: { courseId: true } },
      badge: { select: { id: true, name: true, sourceBadgeId: true } },
    },
  });

  for (const requirement of requirements) {
    if (!requirement.lesson || !requirement.lessonId) continue;
    const courseBadges = byCourse.get(requirement.lesson.courseId) ?? new Map<string, CourseBadge>();
    const rootId = resolveFamilyRootId(requirement.badge);
    const existing = courseBadges.get(rootId);
    if (existing) {
      if (!existing.lessonIds.includes(requirement.lessonId)) existing.lessonIds.push(requirement.lessonId);
    } else {
      courseBadges.set(rootId, {
        badgeId: requirement.badge.id,
        rootId,
        name: requirement.badge.name,
        lessonIds: [requirement.lessonId],
      });
    }
    byCourse.set(requirement.lesson.courseId, courseBadges);
  }
  return byCourse;
}

// Prerequisites of rootId that the course does not contain. Import uses this to
// refuse adding a badge before its prerequisites.
export async function findMissingPrereqsForCourse(db: Db, courseId: string, rootId: string) {
  const prereqs = (await loadPrerequisitesByRoot(db, [rootId])).get(rootId) ?? [];
  if (prereqs.length === 0) return [];

  const courseBadges = (await loadCourseBadges(db, [courseId])).get(courseId) ?? new Map();
  return prereqs.filter((prereq) => !courseBadges.has(prereq.id));
}

// Courses that already contain a copy of rootId but lack one of prereqRootIds.
// The wizard refuses a save that would leave students in those courses locked.
export async function findCoursesMissingPrereqs(
  db: Db,
  rootId: string,
  prereqs: BadgeRef[]
): Promise<CourseMissingPrereqs[]> {
  if (prereqs.length === 0) return [];

  const placements = await db.badgeRequirement.findMany({
    where: {
      badge: { OR: [{ id: rootId }, { sourceBadgeId: rootId }] },
      lesson: { isNot: null },
    },
    select: { lesson: { select: { course: { select: { id: true, title: true } } } } },
  });

  const courses = new Map<string, string>();
  for (const placement of placements) {
    if (placement.lesson) courses.set(placement.lesson.course.id, placement.lesson.course.title);
  }
  if (courses.size === 0) return [];

  const courseBadges = await loadCourseBadges(db, [...courses.keys()]);
  const result: CourseMissingPrereqs[] = [];
  for (const [courseId, title] of courses) {
    const present = courseBadges.get(courseId) ?? new Map();
    const missing = prereqs.filter((prereq) => !present.has(prereq.id));
    if (missing.length > 0) result.push({ courseId, title, missing });
  }
  return result;
}

// Badges in the course that require the given root. Unassign refuses to remove a
// badge while one of these is still in the course.
export async function findCourseDependents(db: Db, courseId: string, rootId: string) {
  const relations = await db.badgeRelation.findMany({
    where: { type: BadgeRelationType.PREREQUISITE, fromBadgeId: rootId },
    select: { toBadgeId: true },
  });
  if (relations.length === 0) return [];

  const courseBadges = (await loadCourseBadges(db, [courseId])).get(courseId) ?? new Map<string, CourseBadge>();
  return relations
    .map((relation) => courseBadges.get(relation.toBadgeId))
    .filter((badge): badge is CourseBadge => Boolean(badge))
    .map((badge) => ({ id: badge.badgeId, name: badge.name }));
}

// Replaces rootId's prerequisites with prereqIds (any family member's id is
// accepted and resolved to its root). undefined means "leave untouched".
export async function syncBadgePrerequisites(
  db: Db,
  { rootId, editorId, prereqIds }: { rootId: string; editorId: string; prereqIds: string[] | undefined }
) {
  if (prereqIds === undefined) return;

  const requested = prereqIds.length
    ? await db.badge.findMany({
        where: { id: { in: prereqIds } },
        select: { id: true, sourceBadgeId: true },
      })
    : [];
  if (requested.length !== new Set(prereqIds).size) {
    throw new BadgePrerequisiteError('One of the selected prerequisite badges no longer exists.', 400);
  }

  const nextRootIds = [...new Set(requested.map(resolveFamilyRootId))];
  const roots = nextRootIds.length
    ? await db.badge.findMany({
        where: { id: { in: nextRootIds }, sourceBadgeId: null, OR: [{ createdById: editorId }, { createdById: null }] },
        select: { id: true, name: true },
      })
    : [];
  if (roots.length !== nextRootIds.length) {
    throw new BadgePrerequisiteError('You can only require badges from your badge library.', 400);
  }
  const nameById = new Map(roots.map((root) => [root.id, root.name]));

  const validation = validatePrerequisiteSet(await loadPrerequisiteEdges(db), rootId, nextRootIds);
  if (!validation.ok) {
    const name = nameById.get(validation.badgeId) ?? 'That badge';
    const message =
      validation.reason === 'CYCLE'
        ? `${name} already requires this badge, directly or through another badge, so it cannot also be its prerequisite.`
        : validation.reason === 'SELF'
          ? 'A badge cannot be its own prerequisite.'
          : `${name} is listed more than once.`;
    throw new BadgePrerequisiteError(message, 400);
  }

  const current = await db.badgeRelation.findMany({
    where: { type: BadgeRelationType.PREREQUISITE, toBadgeId: rootId },
    select: { fromBadgeId: true },
  });
  const currentIds = new Set(current.map((relation) => relation.fromBadgeId));
  const added = nextRootIds.filter((id) => !currentIds.has(id));
  const removed = [...currentIds].filter((id) => !nextRootIds.includes(id));

  const blocked = await findCoursesMissingPrereqs(
    db,
    rootId,
    added.map((id) => ({ id, name: nameById.get(id) ?? '' }))
  );
  if (blocked.length > 0) {
    const first = blocked[0];
    const more = blocked.length > 1 ? ` (and ${blocked.length - 1} more course${blocked.length > 2 ? 's' : ''})` : '';
    throw new BadgePrerequisiteError(
      `Add ${formatBadgeNameList(first.missing.map((badge) => badge.name))} to ${first.title}${more} before requiring it, or students there would be locked out of this badge.`,
      409,
      { courses: blocked }
    );
  }

  if (removed.length > 0) {
    await db.badgeRelation.deleteMany({
      where: { type: BadgeRelationType.PREREQUISITE, toBadgeId: rootId, fromBadgeId: { in: removed } },
    });
  }
  if (added.length > 0) {
    await db.badgeRelation.createMany({
      data: added.map((fromBadgeId) => ({ type: BadgeRelationType.PREREQUISITE, fromBadgeId, toBadgeId: rootId })),
      skipDuplicates: true,
    });
  }
}

// Per-student lock state for course badges (by course copy id). Computed live,
// never stored, so resetting A re-locks B for anyone who has not started B.
export async function getPrerequisiteStatusForStudent(
  db: Db,
  { studentId, courseId, badgeIds }: { studentId: string; courseId: string; badgeIds: string[] }
) {
  const statuses = new Map<string, PrerequisiteStatus>();
  if (badgeIds.length === 0) return statuses;

  const courseBadges = (await loadCourseBadges(db, [courseId])).get(courseId) ?? new Map<string, CourseBadge>();
  const requested = [...courseBadges.values()].filter((badge) => badgeIds.includes(badge.badgeId));
  const prereqsByRoot = await loadPrerequisitesByRoot(
    db,
    requested.map((badge) => badge.rootId)
  );

  const withPrereqs = requested.filter((badge) => (prereqsByRoot.get(badge.rootId) ?? []).length > 0);
  if (withPrereqs.length === 0) {
    for (const badge of requested) {
      statuses.set(badge.badgeId, { requires: [], unmet: [], started: false, locked: false });
    }
    return statuses;
  }

  const prereqCopyIds = withPrereqs.flatMap((badge) =>
    (prereqsByRoot.get(badge.rootId) ?? [])
      .map((prereq) => courseBadges.get(prereq.id)?.badgeId)
      .filter((id): id is string => Boolean(id))
  );
  const [studentBadges, progress] = await Promise.all([
    db.studentBadge.findMany({
      where: { studentId, badgeId: { in: [...new Set([...prereqCopyIds, ...withPrereqs.map((b) => b.badgeId)])] } },
      select: { badgeId: true, status: true, qevWaivedAt: true },
    }),
    db.lessonProgress.findMany({
      where: { studentId, lessonId: { in: withPrereqs.flatMap((badge) => badge.lessonIds) } },
      select: { lessonId: true },
    }),
  ]);
  const studentBadgeById = new Map(studentBadges.map((row) => [row.badgeId, row]));
  const startedLessons = new Set(progress.map((row) => row.lessonId));

  for (const badge of requested) {
    // Show the course copy's name; a prerequisite missing from the course (should
    // not happen, see invariant) stays unmet so the lock errs on the strict side.
    const requires = (prereqsByRoot.get(badge.rootId) ?? []).map((prereq) => {
      const copy = courseBadges.get(prereq.id);
      return copy ? { id: copy.badgeId, name: copy.name } : prereq;
    });
    const unmet = requires.filter((prereq) => studentBadgeById.get(prereq.id)?.status !== BadgeStatus.COMPLETED);
    const own = studentBadgeById.get(badge.badgeId);
    const started =
      badge.lessonIds.some((lessonId) => startedLessons.has(lessonId)) ||
      (own !== undefined && (own.status !== BadgeStatus.LEARNING || own.qevWaivedAt !== null));

    statuses.set(badge.badgeId, {
      requires,
      unmet,
      started,
      locked: isPrerequisiteLocked({ unmetCount: unmet.length, started }),
    });
  }
  return statuses;
}

// Server gate for the student lesson routes: returns the badges still needed when
// the lesson's badge is locked behind a prerequisite, otherwise null.
export async function findLessonPrerequisiteLock(
  db: Db,
  { studentId, lessonId }: { studentId: string; lessonId: string }
) {
  const lesson = await db.lesson.findUnique({
    where: { id: lessonId },
    select: { courseId: true, badgeRequirements: { select: { badgeId: true } } },
  });
  if (!lesson || lesson.badgeRequirements.length === 0) return null;

  const statuses = await getPrerequisiteStatusForStudent(db, {
    studentId,
    courseId: lesson.courseId,
    badgeIds: lesson.badgeRequirements.map((requirement) => requirement.badgeId),
  });
  for (const status of statuses.values()) {
    if (status.locked) return status.unmet;
  }
  return null;
}

export function prerequisiteLockResponseBody(unmet: BadgeRef[]) {
  return {
    error: `Complete ${formatBadgeNameList(unmet.map((badge) => badge.name))} first.`,
    requires: unmet,
  };
}
