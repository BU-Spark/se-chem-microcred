import prisma from '@/lib/prisma';
import {
  badgeMessageGroupMatches,
  deriveBadgeAnalytics,
  type BadgeMessageGroup,
  type StoredBadgeStatus,
} from '@/lib/badgeAnalyticsStatus';

// Narrows studentIds to those in a badge message group, using the same
// derivation as the badge detail page so card counts equal recipients. Shared
// by group blasts and the automated feedback-review reminders.
export async function filterToBadgeGroup(options: {
  courseId: string;
  badgeId: string;
  group: BadgeMessageGroup;
  studentIds: string[];
}) {
  const { courseId, badgeId, group, studentIds } = options;
  const students = await prisma.user.findMany({
    where: { id: { in: studentIds } },
    select: {
      id: true,
      badgeProgress: { where: { badgeId }, take: 1, select: { status: true } },
      assessmentAttempts: {
        where: { courseId, badgeId },
        orderBy: [{ completedAt: 'asc' }, { createdAt: 'asc' }],
        select: { passed: true },
      },
      surveyResponses: { where: { prompt: { badgeId, context: 'BADGE' } }, select: { id: true } },
      lessonProgress: {
        where: { lesson: { badgeRequirements: { some: { badgeId } } } },
        select: { status: true, startedAt: true, completedAt: true, percentComplete: true },
      },
    },
  });

  return students
    .filter((student) => {
      const progress = student.badgeProgress[0] ?? null;
      const analytics = deriveBadgeAnalytics({
        progress: progress ? { status: progress.status as StoredBadgeStatus } : null,
        lessonProgress: student.lessonProgress,
        assessmentAttempts: student.assessmentAttempts,
        surveyResponseCount: student.surveyResponses.length,
      });
      return badgeMessageGroupMatches(group, analytics);
    })
    .map((student) => student.id);
}
