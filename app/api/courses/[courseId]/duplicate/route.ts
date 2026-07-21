import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
import { CourseRole, Prisma, SurveyContext } from '@prisma/client';
import { randomUUID } from 'crypto';

import prisma from '@/lib/prisma';

function normalizeEmail(email?: string | null) {
  const trimmed = email?.trim().toLowerCase();
  return trimmed ? trimmed : null;
}

/**
 * Deep-copies a course the caller owns into a brand-new course owned by the caller.
 * Copies structure (settings, lessons + segments/checkpoints/questions/skills,
 * badges + requirements, survey prompts) but resets all state: no student/checker
 * enrollments, no checker contacts, no progress, no attempts, no StudentBadges,
 * no survey responses.
 */
export async function POST(_req: NextRequest, context: { params: Promise<{ courseId: string }> }) {
  try {
    const clerkUser = await currentUser();
    const email = normalizeEmail(clerkUser?.emailAddresses?.[0]?.emailAddress);
    const { courseId } = await context.params;

    if (!email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!courseId) {
      return NextResponse.json({ error: 'Course id is required.' }, { status: 400 });
    }

    const creator = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (!creator) {
      return NextResponse.json({ error: 'Creator user record was not found in the database.' }, { status: 404 });
    }

    const result = await prisma.$transaction(
      async (tx) => {
        const source = await tx.course.findFirst({
          where: { id: courseId, createdById: creator.id },
          include: {
            settings: true,
            lessons: {
              orderBy: { sortOrder: 'asc' },
              include: {
                segments: { orderBy: { sortOrder: 'asc' } },
                skills: { orderBy: { sortOrder: 'asc' } },
                surveys: true,
                checkpoints: {
                  orderBy: { sortOrder: 'asc' },
                  include: { questions: { orderBy: { sortOrder: 'asc' } } },
                },
                badgeRequirements: {
                  include: { badge: { include: { surveys: true } } },
                },
              },
            },
          },
        });

        if (!source) {
          return {
            error: NextResponse.json(
              { error: 'Course not found or you do not have permission to duplicate it.' },
              { status: 404 }
            ),
          };
        }

        const newCourse = await tx.course.create({
          data: {
            title: `Copy of ${source.title}`,
            sectionCount: source.sectionCount,
            description: source.description,
            createdById: creator.id,
            settings: {
              create: {
                allowCooldownOverride: source.settings?.allowCooldownOverride ?? false,
                allowAssessorMessages: source.settings?.allowAssessorMessages ?? false,
                allowCrossSectionView: source.settings?.allowCrossSectionView ?? false,
              },
            },
          },
          select: { id: true, title: true },
        });

        // Creator is the instructor of the duplicate.
        await tx.enrollment.create({
          data: {
            studentId: creator.id,
            courseId: newCourse.id,
            role: CourseRole.INSTRUCTOR,
          },
        });

        // ---------------------------------------------------------------------
        // Deep-copy is rewritten to batch every entity type with createMany +
        // a read-back findMany to recover generated ids, instead of issuing one
        // .create() per row. This keeps the whole copy within a handful of
        // round-trips so it stays under Prisma Accelerate's 15s tx cap.
        //
        // Read-back natural keys (all backed by @@unique in schema.prisma):
        //   lessons      -> slug (globally @unique)
        //   segments     -> (lessonId, sortOrder)
        //   checkpoints  -> (lessonId, sortOrder)
        //   badges       -> slug (globally @unique)
        // skills, questions, surveyPrompts and badgeRequirements need no
        // read-back (nothing references their generated ids), so they are pure
        // createMany.
        // ---------------------------------------------------------------------

        // 1. Lessons. Precompute a unique slug per source lesson and remember
        //    the mapping so we can recover new ids by slug after createMany.
        const newSlugBySourceLesson = new Map<string, string>();
        const lessonData = source.lessons.map((lesson) => {
          const newSlug = `${lesson.slug}-${randomUUID().slice(0, 8)}`;
          newSlugBySourceLesson.set(lesson.id, newSlug);
          return {
            courseId: newCourse.id,
            slug: newSlug,
            title: lesson.title,
            summary: lesson.summary,
            description: lesson.description,
            thumbnailUrl: lesson.thumbnailUrl,
            estimatedMinutes: lesson.estimatedMinutes,
            dueDate: lesson.dueDate,
            passingPercent: lesson.passingPercent,
            sortOrder: lesson.sortOrder,
          };
        });

        const lessonIdBySource = new Map<string, string>();

        if (lessonData.length > 0) {
          await tx.lesson.createMany({ data: lessonData });

          const createdLessons = await tx.lesson.findMany({
            where: { slug: { in: lessonData.map((lesson) => lesson.slug) } },
            select: { id: true, slug: true },
          });
          const lessonIdBySlug = new Map(createdLessons.map((lesson) => [lesson.slug, lesson.id]));
          for (const lesson of source.lessons) {
            const newId = lessonIdBySlug.get(newSlugBySourceLesson.get(lesson.id)!);
            if (newId) lessonIdBySource.set(lesson.id, newId);
          }
        }

        const newLessonIds = Array.from(lessonIdBySource.values());

        // 2. Segments (all lessons batched). Read back by (lessonId, sortOrder).
        const segmentData = source.lessons.flatMap((lesson) => {
          const lessonId = lessonIdBySource.get(lesson.id);
          if (!lessonId) return [];
          return lesson.segments.map((segment) => ({
            lessonId,
            sortOrder: segment.sortOrder,
            title: segment.title,
            summary: segment.summary,
            duration: segment.duration,
            videoUrl: segment.videoUrl,
            muxPlaybackId: segment.muxPlaybackId,
            thumbnailUrl: segment.thumbnailUrl,
          }));
        });

        const segmentIdBySource = new Map<string, string>();

        if (segmentData.length > 0) {
          await tx.lessonSegment.createMany({ data: segmentData });

          const createdSegments = await tx.lessonSegment.findMany({
            where: { lessonId: { in: newLessonIds } },
            select: { id: true, lessonId: true, sortOrder: true },
          });
          const segmentIdByKey = new Map(createdSegments.map((s) => [`${s.lessonId}:${s.sortOrder}`, s.id]));
          for (const lesson of source.lessons) {
            const lessonId = lessonIdBySource.get(lesson.id);
            if (!lessonId) continue;
            for (const segment of lesson.segments) {
              const newId = segmentIdByKey.get(`${lessonId}:${segment.sortOrder}`);
              if (newId) segmentIdBySource.set(segment.id, newId);
            }
          }
        }

        // 3. Skills (all lessons batched). No read-back needed.
        const skillData = source.lessons.flatMap((lesson) => {
          const lessonId = lessonIdBySource.get(lesson.id);
          if (!lessonId) return [];
          return lesson.skills.map((skill) => ({
            lessonId,
            sortOrder: skill.sortOrder,
            text: skill.text,
          }));
        });

        if (skillData.length > 0) {
          await tx.lessonSkill.createMany({ data: skillData });
        }

        // 4. Checkpoints (all lessons batched). Remap segmentId via the map from
        //    step 2, then read back by (lessonId, sortOrder) for the questions.
        const checkpointData = source.lessons.flatMap((lesson) => {
          const lessonId = lessonIdBySource.get(lesson.id);
          if (!lessonId) return [];
          return lesson.checkpoints.map((checkpoint) => ({
            lessonId,
            segmentId: checkpoint.segmentId ? (segmentIdBySource.get(checkpoint.segmentId) ?? null) : null,
            sortOrder: checkpoint.sortOrder,
            title: checkpoint.title,
            description: checkpoint.description,
            label: checkpoint.label,
            meta: checkpoint.meta,
            questionCount: checkpoint.questionCount,
            timeOffsetSeconds: checkpoint.timeOffsetSeconds,
            snapshotUrl: checkpoint.snapshotUrl,
          }));
        });

        // sourceCheckpointId -> newCheckpointId, so questions can be remapped.
        const checkpointIdBySource = new Map<string, string>();

        if (checkpointData.length > 0) {
          await tx.lessonCheckpoint.createMany({ data: checkpointData });

          const createdCheckpoints = await tx.lessonCheckpoint.findMany({
            where: { lessonId: { in: newLessonIds } },
            select: { id: true, lessonId: true, sortOrder: true },
          });
          const checkpointIdByKey = new Map(createdCheckpoints.map((c) => [`${c.lessonId}:${c.sortOrder}`, c.id]));
          for (const lesson of source.lessons) {
            const lessonId = lessonIdBySource.get(lesson.id);
            if (!lessonId) continue;
            for (const checkpoint of lesson.checkpoints) {
              const newId = checkpointIdByKey.get(`${lessonId}:${checkpoint.sortOrder}`);
              if (newId) checkpointIdBySource.set(checkpoint.id, newId);
            }
          }
        }

        // 5. Questions (all checkpoints batched). No read-back needed.
        const questionData = source.lessons.flatMap((lesson) =>
          lesson.checkpoints.flatMap((checkpoint) => {
            const checkpointId = checkpointIdBySource.get(checkpoint.id);
            if (!checkpointId) return [];
            return checkpoint.questions.map((question) => ({
              checkpointId,
              sortOrder: question.sortOrder,
              prompt: question.prompt,
              options: question.options as Prisma.InputJsonValue,
              correctIndex: question.correctIndex,
            }));
          })
        );

        if (questionData.length > 0) {
          await tx.checkpointQuestion.createMany({ data: questionData });
        }

        // Lesson-context survey prompts are intentionally not copied — lesson
        // surveys were removed (QEV completion is checkpoints + passing grade).

        // 7. Badges. Dedupe per source badge (referenced by multiple
        //    requirements). Batch-create with skipDuplicates, read back by slug.
        const badgeIdBySource = new Map<string, string>();
        const newSlugBySourceBadge = new Map<string, string>();
        const badgeData: {
          slug: string;
          name: string;
          description: string | null;
          createdById: string;
          sourceBadgeId: string;
        }[] = [];
        const seenSourceBadges = new Set<string>();

        for (const lesson of source.lessons) {
          for (const requirement of lesson.badgeRequirements) {
            const sourceBadge = requirement.badge;
            if (!sourceBadge || seenSourceBadges.has(sourceBadge.id)) continue;
            seenSourceBadges.add(sourceBadge.id);

            const newSlug = `${sourceBadge.slug}-${randomUUID().slice(0, 8)}`;
            newSlugBySourceBadge.set(sourceBadge.id, newSlug);
            badgeData.push({
              slug: newSlug,
              name: sourceBadge.name,
              description: sourceBadge.description,
              createdById: creator.id,
              sourceBadgeId: sourceBadge.sourceBadgeId ?? sourceBadge.id,
            });
          }
        }

        if (badgeData.length > 0) {
          // No skipDuplicates: slugs are UUID-suffixed and unique, so a real
          // collision must surface as an error rather than be silently skipped
          // (a skipped badge would leave badgeIdBySource empty and corrupt the
          // requirement FK back to the source course's badge).
          await tx.badge.createMany({ data: badgeData });

          const createdBadges = await tx.badge.findMany({
            where: { slug: { in: badgeData.map((badge) => badge.slug) } },
            select: { id: true, slug: true },
          });
          const badgeIdBySlug = new Map(createdBadges.map((badge) => [badge.slug, badge.id]));
          for (const [sourceBadgeId, slug] of newSlugBySourceBadge) {
            const newId = badgeIdBySlug.get(slug);
            if (newId) badgeIdBySource.set(sourceBadgeId, newId);
          }
        }

        // 8. Badge-context survey prompts for each newly-created badge.
        const badgeSurveyData: { context: SurveyContext; badgeId: string; question: string }[] = [];
        const seenBadgeSurveys = new Set<string>();
        for (const lesson of source.lessons) {
          for (const requirement of lesson.badgeRequirements) {
            const sourceBadge = requirement.badge;
            if (!sourceBadge) continue;
            const newBadgeId = badgeIdBySource.get(sourceBadge.id);
            if (!newBadgeId || seenBadgeSurveys.has(sourceBadge.id)) continue;
            seenBadgeSurveys.add(sourceBadge.id);

            for (const survey of sourceBadge.surveys) {
              if (survey.context !== SurveyContext.BADGE) continue;
              badgeSurveyData.push({
                context: SurveyContext.BADGE,
                badgeId: newBadgeId,
                question: survey.question,
              });
            }
          }
        }

        if (badgeSurveyData.length > 0) {
          await tx.surveyPrompt.createMany({ data: badgeSurveyData });
        }

        // 9. Badge requirements (all lessons batched). Falls back to the source
        //    badgeId when the badge could not be cloned, matching prior behavior.
        const requirementData = source.lessons.flatMap((lesson) => {
          const lessonId = lessonIdBySource.get(lesson.id);
          if (!lessonId) return [];
          return lesson.badgeRequirements.map((requirement) => {
            const sourceBadge = requirement.badge;
            const newBadgeId = sourceBadge ? badgeIdBySource.get(sourceBadge.id) : undefined;
            return {
              badgeId: newBadgeId ?? requirement.badgeId,
              lessonId,
              summary: requirement.summary,
            };
          });
        });

        if (requirementData.length > 0) {
          await tx.badgeRequirement.createMany({ data: requirementData });
        }

        return { course: newCourse };
      },
      // Prisma Accelerate caps interactive-transaction timeout at 15s (P6005).
      { maxWait: 5000, timeout: 15000 }
    );

    if ('error' in result) {
      return result.error;
    }

    // Ensure the creator has an analytics row (idempotent).
    await prisma.studentAnalytics.createMany({
      data: [{ studentId: creator.id }],
      skipDuplicates: true,
    });

    return NextResponse.json({ message: 'Course duplicated successfully.', course: result.course }, { status: 201 });
  } catch (error) {
    console.error('POST /api/courses/[courseId]/duplicate failed:', error);
    return NextResponse.json({ error: 'Failed to duplicate course.' }, { status: 500 });
  }
}
