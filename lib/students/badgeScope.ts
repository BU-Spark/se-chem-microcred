import type { Prisma } from '@prisma/client';

/**
 * Where-clause for a student's badges, optionally narrowed to a single course.
 *
 * `Badge` has no courseId column and neither does `StudentBadge`: a badge belongs
 * to a course only through `BadgeRequirement -> Lesson.courseId`. Scoping has to
 * filter across that join, which is the same route the course's own badge list
 * takes in the student API.
 *
 * Scoping is opt-in (`courseRequested`) because two surfaces read the same
 * endpoint without a courseId and are cross-course by design: the Badge Passport
 * (/badges) and Home. Narrowing them would hide badges the student really holds.
 */
export function studentBadgeScope({
  studentId,
  courseId,
  courseRequested,
}: {
  studentId: string;
  courseId: string | null;
  courseRequested: boolean;
}): Prisma.StudentBadgeWhereInput {
  if (!courseRequested) {
    return { studentId };
  }

  if (!courseId) {
    // A courseId was requested but resolved to no enrollment. Falling back to
    // every course's badges here would reopen the leak this scoping exists to
    // close, so match nothing instead.
    return { studentId, badgeId: { in: [] } };
  }

  return {
    studentId,
    badge: {
      OR: [
        { requirements: { some: { lesson: { courseId } } } },
        // A badge whose requirements carry no lesson has no derivable course, so
        // it can't be another course's badge either. Keep it: nothing else
        // surfaces such a badge, and the feedback page redirects to /badges for
        // any badge missing from these buckets, so excluding it would strand the
        // student on a badge they legitimately hold.
        { requirements: { none: { lessonId: { not: null } } } },
      ],
    },
  };
}

/**
 * The course a badge belongs to, or null when no requirement is lesson-backed.
 *
 * Takes the first requirement that resolves a lesson. Badge import creates a
 * per-course copy of each badge, so requirements are not expected to span
 * courses; if that ever changes this becomes lossy and the callers need a set.
 */
export function resolveBadgeCourseId(requirements: Array<{ lesson: { courseId: string } | null }>): string | null {
  return requirements.find((requirement) => requirement.lesson?.courseId)?.lesson?.courseId ?? null;
}
