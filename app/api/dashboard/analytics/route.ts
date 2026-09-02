import { NextResponse } from 'next/server';
import { BadgeStatus, CourseRole, EnrollmentStatus, LessonStatus } from '@prisma/client';

import { ensureCurrentUser } from '@/app/api/courses/lib/ensure-user';
import { classifyLessonProgress, hasLessonActivity, type ProgressBucket } from '@/lib/badgeBuckets';
import prisma from '@/lib/prisma';

const UPCOMING_DAYS = 14;

export async function GET() {
  try {
    const user = await ensureCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const now = new Date();
    const upcomingCutoff = new Date(now);
    upcomingCutoff.setDate(upcomingCutoff.getDate() + UPCOMING_DAYS);

    const [createdCourses, studentEnrollments, checkerEnrollments] = await Promise.all([
      prisma.course.findMany({
        where: { createdById: user.id },
        select: {
          id: true,
          enrollments: {
            where: { status: EnrollmentStatus.ACTIVE },
            select: { role: true },
          },
          lessons: {
            select: {
              badgeRequirements: {
                select: {
                  badge: { select: { id: true, availableOn: true, closesOn: true, neverCloses: true } },
                },
              },
            },
          },
        },
      }),
      prisma.enrollment.findMany({
        where: { studentId: user.id, role: CourseRole.STUDENT, status: EnrollmentStatus.ACTIVE },
        select: { courseId: true },
      }),
      prisma.enrollment.findMany({
        where: { studentId: user.id, role: CourseRole.CHECKER, status: EnrollmentStatus.ACTIVE },
        select: { courseId: true, sections: { select: { section: true } } },
      }),
    ]);

    const createdCourseIds = createdCourses.map((course) => course.id);
    const studentCourseIds = studentEnrollments.map((enrollment) => enrollment.courseId);
    const checkerCourseIds = checkerEnrollments.map((enrollment) => enrollment.courseId);
    const checkerSectionsByCourse = new Map(
      checkerEnrollments.map((enrollment) => [
        enrollment.courseId,
        new Set(enrollment.sections.map((assignment) => assignment.section)),
      ])
    );

    const badgeInCourses = (courseIds: string[]) => ({
      requirements: { some: { lesson: { courseId: { in: courseIds } } } },
    });

    const [
      instructorReady,
      instructorInReview,
      pendingCheckerRequests,
      instructorUpcomingDeadlines,
      studentLessons,
      studentReady,
      studentDeadlineRows,
      checkerBadgeRows,
      checkerUpcomingDeadlines,
    ] = await Promise.all([
      createdCourseIds.length
        ? prisma.studentBadge.count({
            where: {
              status: BadgeStatus.READY_FOR_ASSESSMENT,
              OR: [{ cooldownUntil: null }, { cooldownUntil: { lte: now } }],
              badge: badgeInCourses(createdCourseIds),
            },
          })
        : 0,
      createdCourseIds.length
        ? prisma.studentBadge.count({
            where: { status: BadgeStatus.IN_REVIEW, badge: badgeInCourses(createdCourseIds) },
          })
        : 0,
      createdCourseIds.length
        ? prisma.enrollment.count({
            where: {
              courseId: { in: createdCourseIds },
              role: CourseRole.CHECKER,
              status: EnrollmentStatus.PENDING,
            },
          })
        : 0,
      createdCourseIds.length
        ? prisma.badge.count({
            where: {
              neverCloses: { not: true },
              closesOn: { gte: now, lte: upcomingCutoff },
              ...badgeInCourses(createdCourseIds),
            },
          })
        : 0,
      studentCourseIds.length
        ? prisma.lesson.findMany({
            where: { courseId: { in: studentCourseIds } },
            select: {
              id: true,
              courseId: true,
              progress: {
                where: { studentId: user.id },

                select: { status: true, startedAt: true, completedAt: true, percentComplete: true },
                take: 1,
              },

              badgeRequirements: {
                select: {
                  badge: {
                    select: {
                      id: true,
                      availableOn: true,
                      closesOn: true,
                      neverCloses: true,
                      requirements: { select: { lessonId: true } },
                      studentProgress: {
                        where: { studentId: user.id },
                        select: { status: true },
                        take: 1,
                      },
                    },
                  },
                },
              },
            },
          })
        : [],
      studentCourseIds.length
        ? prisma.studentBadge.count({
            where: {
              studentId: user.id,
              status: BadgeStatus.READY_FOR_ASSESSMENT,
              OR: [{ cooldownUntil: null }, { cooldownUntil: { lte: now } }],
              badge: badgeInCourses(studentCourseIds),
            },
          })
        : 0,
      studentCourseIds.length
        ? prisma.studentBadge.findMany({
            where: {
              studentId: user.id,
              status: { not: BadgeStatus.COMPLETED },
              badge: badgeInCourses(studentCourseIds),
            },
            select: {
              badge: {
                select: {
                  closesOn: true,
                  neverCloses: true,
                  requirements: { select: { lesson: { select: { courseId: true } } } },
                },
              },
            },
          })
        : [],
      checkerCourseIds.length
        ? prisma.studentBadge.findMany({
            where: {
              status: { in: [BadgeStatus.READY_FOR_ASSESSMENT, BadgeStatus.IN_REVIEW] },
              badge: badgeInCourses(checkerCourseIds),
            },
            select: {
              status: true,
              cooldownUntil: true,
              student: {
                select: {
                  id: true,
                  enrollments: {
                    where: {
                      courseId: { in: checkerCourseIds },
                      role: CourseRole.STUDENT,
                      status: EnrollmentStatus.ACTIVE,
                    },
                    select: { courseId: true, sections: { select: { section: true } } },
                  },
                },
              },
              badge: {
                select: { requirements: { select: { lesson: { select: { courseId: true } } } } },
              },
            },
          })
        : [],
      checkerCourseIds.length
        ? prisma.badge.count({
            where: {
              neverCloses: { not: true },
              closesOn: { gte: now, lte: upcomingCutoff },
              ...badgeInCourses(checkerCourseIds),
            },
          })
        : 0,
    ]);

    // Classify every lesson once, then reuse it for both the global totals here and
    // the per-course card metrics further down, so the two can never disagree.
    const studentProgressByLessonId = new Map(studentLessons.map((lesson) => [lesson.id, lesson.progress[0] ?? null]));

    const studentLessonBuckets = studentLessons.map((lesson) => {
      const badges = lesson.badgeRequirements
        .map((requirement) => requirement.badge)
        .filter((badge): badge is NonNullable<typeof badge> => Boolean(badge))
        .map((badge) => ({
          status: badge.studentProgress[0]?.status ?? null,
          availableOn: badge.availableOn,
          closesOn: badge.closesOn,
          neverCloses: badge.neverCloses,
          hasActivity: badge.requirements.some(
            (requirement) =>
              requirement.lessonId && hasLessonActivity(studentProgressByLessonId.get(requirement.lessonId))
          ),
        }));

      const lessonStatus = lesson.progress[0]?.status ?? LessonStatus.NOT_STARTED;
      const fallback: ProgressBucket =
        lessonStatus === LessonStatus.COMPLETED
          ? 'COMPLETED'
          : lessonStatus === LessonStatus.IN_PROGRESS
            ? 'IN_PROGRESS'
            : 'NOT_STARTED';

      return { courseId: lesson.courseId, bucket: classifyLessonProgress(badges, fallback, now) };
    });

    const studentLessonMetrics = studentLessonBuckets.reduce(
      (totals, entry) => {
        if (entry.bucket === 'NOT_STARTED') totals.notStarted += 1;
        if (entry.bucket === 'IN_PROGRESS') totals.inProgress += 1;
        if (entry.bucket === 'COMPLETED') totals.completed += 1;
        return totals;
      },
      { notStarted: 0, inProgress: 0, completed: 0, upcoming: 0, overdue: 0 }
    );

    for (const row of studentDeadlineRows) {
      const deadline = row.badge.neverCloses === true ? null : row.badge.closesOn;
      if (!deadline) continue;
      if (deadline < now) studentLessonMetrics.overdue += 1;
      else if (deadline <= upcomingCutoff) studentLessonMetrics.upcoming += 1;
    }

    const checkerRowsInScope = checkerBadgeRows.filter((row) =>
      row.badge.requirements.some((requirement) => {
        const courseId = requirement.lesson?.courseId;
        if (!courseId) return false;
        const checkerSections = checkerSectionsByCourse.get(courseId);
        return row.student.enrollments.some((enrollment) => {
          if (enrollment.courseId !== courseId) return false;
          if (!checkerSections || checkerSections.size === 0) return true;
          return enrollment.sections.some((assignment) => checkerSections.has(assignment.section));
        });
      })
    );

    const [
      instructorActionRows,
      pendingCheckerRows,
      instructorDeadlineRows,
      studentReadyRows,
      checkerDeadlineRows,
      checkerActiveBadgeRows,
    ] = await Promise.all([
      createdCourseIds.length
        ? prisma.studentBadge.findMany({
            where: {
              status: { in: [BadgeStatus.READY_FOR_ASSESSMENT, BadgeStatus.IN_REVIEW] },
              badge: badgeInCourses(createdCourseIds),
            },
            select: {
              status: true,
              cooldownUntil: true,
              badge: { select: { requirements: { select: { lesson: { select: { courseId: true } } } } } },
            },
          })
        : [],
      createdCourseIds.length
        ? prisma.enrollment.findMany({
            where: {
              courseId: { in: createdCourseIds },
              role: CourseRole.CHECKER,
              status: EnrollmentStatus.PENDING,
            },
            select: { courseId: true },
          })
        : [],
      createdCourseIds.length
        ? prisma.badge.findMany({
            where: {
              neverCloses: { not: true },
              closesOn: { gte: now, lte: upcomingCutoff },
              ...badgeInCourses(createdCourseIds),
            },
            select: { requirements: { select: { lesson: { select: { courseId: true } } } } },
          })
        : [],
      studentCourseIds.length
        ? prisma.studentBadge.findMany({
            where: {
              studentId: user.id,
              status: BadgeStatus.READY_FOR_ASSESSMENT,
              OR: [{ cooldownUntil: null }, { cooldownUntil: { lte: now } }],
              badge: badgeInCourses(studentCourseIds),
            },
            select: { badge: { select: { requirements: { select: { lesson: { select: { courseId: true } } } } } } },
          })
        : [],
      checkerCourseIds.length
        ? prisma.badge.findMany({
            where: {
              neverCloses: { not: true },
              closesOn: { gte: now, lte: upcomingCutoff },
              ...badgeInCourses(checkerCourseIds),
            },
            select: { requirements: { select: { lesson: { select: { courseId: true } } } } },
          })
        : [],
      checkerCourseIds.length
        ? prisma.badge.findMany({
            where: {
              AND: [
                { OR: [{ availableOn: null }, { availableOn: { lte: now } }] },
                { OR: [{ neverCloses: true }, { closesOn: null }, { closesOn: { gt: now } }] },
              ],
              ...badgeInCourses(checkerCourseIds),
            },
            select: {
              id: true,
              requirements: { select: { lesson: { select: { courseId: true } } } },
            },
          })
        : [],
    ]);

    type CourseActions = Record<string, Record<string, number>>;
    const byCourse: { instructor: CourseActions; student: CourseActions; checker: CourseActions } = {
      instructor: {},
      student: {},
      checker: {},
    };
    const metric = (role: keyof typeof byCourse, courseId: string, key: string) => {
      byCourse[role][courseId] ??= {};
      byCourse[role][courseId][key] = (byCourse[role][courseId][key] ?? 0) + 1;
    };

    for (const course of createdCourses) {
      const badges = new Map(
        course.lessons.flatMap((lesson) =>
          lesson.badgeRequirements.map((requirement) => [requirement.badge.id, requirement.badge])
        )
      );
      byCourse.instructor[course.id] = {
        students: course.enrollments.filter((enrollment) => enrollment.role === CourseRole.STUDENT).length,
        checkers: course.enrollments.filter((enrollment) => enrollment.role === CourseRole.CHECKER).length,
        activeBadges: Array.from(badges.values()).filter(
          (badge) =>
            (!badge.availableOn || badge.availableOn <= now) &&
            (badge.neverCloses === true || !badge.closesOn || badge.closesOn > now)
        ).length,
      };
    }
    for (const enrollment of checkerEnrollments) {
      byCourse.checker[enrollment.courseId] = { sections: enrollment.sections.length };
    }

    for (const row of instructorActionRows) {
      const key = row.status === BadgeStatus.IN_REVIEW ? 'awaitingStudentReview' : 'readyForAssessment';
      if (key === 'readyForAssessment' && row.cooldownUntil && row.cooldownUntil > now) continue;
      for (const requirement of row.badge.requirements) {
        if (requirement.lesson?.courseId) metric('instructor', requirement.lesson.courseId, key);
      }
    }
    for (const row of pendingCheckerRows) metric('instructor', row.courseId, 'pendingCheckerRequests');
    for (const row of instructorDeadlineRows) {
      for (const requirement of row.requirements) {
        if (requirement.lesson?.courseId) metric('instructor', requirement.lesson.courseId, 'upcomingDeadlines');
      }
    }
    for (const entry of studentLessonBuckets) {
      if (entry.bucket === 'NOT_STARTED') metric('student', entry.courseId, 'lessonsNotStarted');
      if (entry.bucket === 'IN_PROGRESS') metric('student', entry.courseId, 'lessonsInProgress');
      if (entry.bucket === 'COMPLETED') metric('student', entry.courseId, 'lessonsCompleted');
    }
    for (const row of studentReadyRows) {
      for (const requirement of row.badge.requirements) {
        if (requirement.lesson?.courseId) metric('student', requirement.lesson.courseId, 'readyForAssessment');
      }
    }
    for (const row of studentDeadlineRows) {
      const deadline = row.badge.neverCloses === true ? null : row.badge.closesOn;
      if (!deadline) continue;
      const key = deadline < now ? 'overdueLessons' : deadline <= upcomingCutoff ? 'upcomingDeadlines' : null;
      if (!key) continue;
      for (const requirement of row.badge.requirements) {
        if (requirement.lesson?.courseId) metric('student', requirement.lesson.courseId, key);
      }
    }
    for (const row of checkerRowsInScope) {
      const key = row.status === BadgeStatus.IN_REVIEW ? 'awaitingStudentReview' : 'readyForAssessment';
      if (key === 'readyForAssessment' && row.cooldownUntil && row.cooldownUntil > now) continue;
      for (const requirement of row.badge.requirements) {
        if (requirement.lesson?.courseId) metric('checker', requirement.lesson.courseId, key);
      }
    }
    const studentsToAssessByCourse = new Map<string, Set<string>>();
    for (const row of checkerRowsInScope) {
      if (row.status !== BadgeStatus.READY_FOR_ASSESSMENT || (row.cooldownUntil && row.cooldownUntil > now)) continue;
      for (const requirement of row.badge.requirements) {
        const courseId = requirement.lesson?.courseId;
        if (!courseId) continue;
        const students = studentsToAssessByCourse.get(courseId) ?? new Set<string>();
        students.add(row.student.id);
        studentsToAssessByCourse.set(courseId, students);
      }
    }
    for (const [courseId, students] of studentsToAssessByCourse) {
      byCourse.checker[courseId] ??= {};
      byCourse.checker[courseId].studentsToAssess = students.size;
    }
    const activeCheckerBadgesByCourse = new Map<string, Set<string>>();
    for (const badge of checkerActiveBadgeRows) {
      for (const requirement of badge.requirements) {
        const courseId = requirement.lesson?.courseId;
        if (!courseId) continue;
        const badges = activeCheckerBadgesByCourse.get(courseId) ?? new Set<string>();
        badges.add(badge.id);
        activeCheckerBadgesByCourse.set(courseId, badges);
      }
    }
    for (const [courseId, badges] of activeCheckerBadgesByCourse) {
      byCourse.checker[courseId] ??= {};
      byCourse.checker[courseId].activeBadges = badges.size;
    }
    for (const row of checkerDeadlineRows) {
      for (const requirement of row.requirements) {
        if (requirement.lesson?.courseId) metric('checker', requirement.lesson.courseId, 'upcomingDeadlines');
      }
    }

    return NextResponse.json({
      instructor: {
        readyForAssessment: instructorReady,
        awaitingStudentReview: instructorInReview,
        pendingCheckerRequests,
        upcomingDeadlines: instructorUpcomingDeadlines,
      },
      student: {
        lessonsNotStarted: studentLessonMetrics.notStarted,
        lessonsInProgress: studentLessonMetrics.inProgress,
        lessonsCompleted: studentLessonMetrics.completed,
        readyForAssessment: studentReady,
        upcomingDeadlines: studentLessonMetrics.upcoming,
        overdueLessons: studentLessonMetrics.overdue,
      },
      checker: {
        readyForAssessment: checkerRowsInScope.filter(
          (row) => row.status === BadgeStatus.READY_FOR_ASSESSMENT && (!row.cooldownUntil || row.cooldownUntil <= now)
        ).length,
        awaitingStudentReview: checkerRowsInScope.filter((row) => row.status === BadgeStatus.IN_REVIEW).length,
        upcomingDeadlines: checkerUpcomingDeadlines,
      },
      byCourse,
      windowDays: UPCOMING_DAYS,
    });
  } catch (error) {
    console.error('GET /api/dashboard/analytics failed:', error);
    return NextResponse.json({ error: 'Failed to fetch dashboard analytics' }, { status: 500 });
  }
}
