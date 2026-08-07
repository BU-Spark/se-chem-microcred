import { SurveyContext } from '@prisma/client';

import prisma from '@/lib/prisma';
import { combineRatingSummaries, emptyRatingSummary, summarizeRatings, type RatingSummary } from '@/lib/surveyRatings';

export type LessonRating = RatingSummary & {
  lessonId: string;
  title: string;
};

export type BadgeRatings = {
  /** Rating given after finalizing the badge (SurveyContext.BADGE). */
  badge: RatingSummary;
  qev: {
    /** Every requirement lesson's ratings pooled, weighted per response. */
    overall: RatingSummary;
    lessons: LessonRating[];
  };
};

/**
 * Both aggregates for one badge, restricted to the students enrolled in this
 * course. Badges and their lessons are course-scoped once imported, but the
 * student filter makes that explicit: a shared source badge can't leak another
 * cohort's ratings into this course's numbers.
 */
export async function fetchBadgeRatings({
  badgeId,
  lessons,
  studentIds,
}: {
  badgeId: string;
  lessons: Array<{ id: string; title: string }>;
  studentIds: string[];
}): Promise<BadgeRatings> {
  const lessonIds = lessons.map((lesson) => lesson.id);

  if (studentIds.length === 0) {
    return {
      badge: emptyRatingSummary(),
      qev: {
        overall: emptyRatingSummary(),
        lessons: lessons.map((lesson) => ({ lessonId: lesson.id, title: lesson.title, ...emptyRatingSummary() })),
      },
    };
  }

  const [badgeResponses, lessonResponses] = await Promise.all([
    prisma.surveyResponse.findMany({
      where: {
        studentId: { in: studentIds },
        prompt: { badgeId, context: SurveyContext.BADGE },
      },
      select: { rating: true },
    }),
    lessonIds.length > 0
      ? prisma.surveyResponse.findMany({
          where: {
            studentId: { in: studentIds },
            prompt: { lessonId: { in: lessonIds }, context: SurveyContext.LESSON },
          },
          select: { rating: true, prompt: { select: { lessonId: true } } },
        })
      : Promise.resolve([]),
  ]);

  const ratingsByLessonId = new Map<string, number[]>();
  for (const response of lessonResponses) {
    const lessonId = response.prompt.lessonId;
    if (!lessonId) continue;

    const bucket = ratingsByLessonId.get(lessonId) ?? [];
    bucket.push(response.rating);
    ratingsByLessonId.set(lessonId, bucket);
  }

  // Every requirement lesson gets a row even with no responses, so the badge page
  // can show which video nobody has rated rather than silently omitting it.
  const lessonSummaries: LessonRating[] = lessons.map((lesson) => ({
    lessonId: lesson.id,
    title: lesson.title,
    ...summarizeRatings(ratingsByLessonId.get(lesson.id) ?? []),
  }));

  return {
    badge: summarizeRatings(badgeResponses.map((response) => response.rating)),
    qev: {
      overall: combineRatingSummaries(lessonSummaries),
      lessons: lessonSummaries,
    },
  };
}
