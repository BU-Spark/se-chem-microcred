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
 * Copies structure (settings, contacts, lessons + segments/checkpoints/questions/skills,
 * badges + requirements, survey prompts) but resets all state: no student/checker
 * enrollments, no progress, no attempts, no StudentBadges, no survey responses.
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
            contacts: true,
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

        if (source.contacts.length > 0) {
          await tx.courseContact.createMany({
            data: source.contacts.map((contact) => ({
              courseId: newCourse.id,
              type: contact.type,
              name: contact.name,
              email: contact.email,
              avatarUrl: contact.avatarUrl,
            })),
          });
        }

        // Avoid cloning the same badge twice if referenced by multiple requirements.
        const badgeIdBySource = new Map<string, string>();

        for (const lesson of source.lessons) {
          const lessonSuffix = randomUUID().slice(0, 8);

          const newLesson = await tx.lesson.create({
            data: {
              courseId: newCourse.id,
              slug: `${lesson.slug}-${lessonSuffix}`,
              title: lesson.title,
              summary: lesson.summary,
              description: lesson.description,
              thumbnailUrl: lesson.thumbnailUrl,
              estimatedMinutes: lesson.estimatedMinutes,
              dueDate: lesson.dueDate,
              passingPercent: lesson.passingPercent,
              sortOrder: lesson.sortOrder,
            },
            select: { id: true },
          });

          const segmentIdBySource = new Map<string, string>();
          for (const segment of lesson.segments) {
            const newSegment = await tx.lessonSegment.create({
              data: {
                lessonId: newLesson.id,
                sortOrder: segment.sortOrder,
                title: segment.title,
                summary: segment.summary,
                duration: segment.duration,
                videoUrl: segment.videoUrl,
                muxPlaybackId: segment.muxPlaybackId,
                thumbnailUrl: segment.thumbnailUrl,
              },
              select: { id: true },
            });
            segmentIdBySource.set(segment.id, newSegment.id);
          }

          for (const skill of lesson.skills) {
            await tx.lessonSkill.create({
              data: { lessonId: newLesson.id, sortOrder: skill.sortOrder, text: skill.text },
            });
          }

          for (const checkpoint of lesson.checkpoints) {
            const newCheckpoint = await tx.lessonCheckpoint.create({
              data: {
                lessonId: newLesson.id,
                segmentId: checkpoint.segmentId ? (segmentIdBySource.get(checkpoint.segmentId) ?? null) : null,
                sortOrder: checkpoint.sortOrder,
                title: checkpoint.title,
                description: checkpoint.description,
                label: checkpoint.label,
                meta: checkpoint.meta,
                questionCount: checkpoint.questionCount,
                timeOffsetSeconds: checkpoint.timeOffsetSeconds,
                snapshotUrl: checkpoint.snapshotUrl,
              },
              select: { id: true },
            });

            for (const question of checkpoint.questions) {
              await tx.checkpointQuestion.create({
                data: {
                  checkpointId: newCheckpoint.id,
                  sortOrder: question.sortOrder,
                  prompt: question.prompt,
                  options: question.options as Prisma.InputJsonValue,
                  correctIndex: question.correctIndex,
                },
              });
            }
          }

          // Lesson-context survey prompts.
          for (const survey of lesson.surveys) {
            if (survey.context !== SurveyContext.LESSON) continue;
            await tx.surveyPrompt.create({
              data: { context: SurveyContext.LESSON, lessonId: newLesson.id, question: survey.question },
            });
          }

          // Badges attached to this lesson via requirements.
          for (const requirement of lesson.badgeRequirements) {
            const sourceBadge = requirement.badge;
            let newBadgeId = sourceBadge ? badgeIdBySource.get(sourceBadge.id) : undefined;

            if (sourceBadge && !newBadgeId) {
              const badgeSuffix = randomUUID().slice(0, 8);
              const newBadge = await tx.badge.create({
                data: {
                  slug: `${sourceBadge.slug}-${badgeSuffix}`,
                  name: sourceBadge.name,
                  description: sourceBadge.description,
                  category: sourceBadge.category,
                  createdById: creator.id,
                  sourceBadgeId: sourceBadge.sourceBadgeId ?? sourceBadge.id,
                },
                select: { id: true },
              });
              newBadgeId = newBadge.id;
              badgeIdBySource.set(sourceBadge.id, newBadge.id);

              for (const survey of sourceBadge.surveys) {
                if (survey.context !== SurveyContext.BADGE) continue;
                await tx.surveyPrompt.create({
                  data: { context: SurveyContext.BADGE, badgeId: newBadge.id, question: survey.question },
                });
              }
            }

            await tx.badgeRequirement.create({
              data: {
                badgeId: newBadgeId ?? requirement.badgeId,
                lessonId: newLesson.id,
                summary: requirement.summary,
              },
            });
          }
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
