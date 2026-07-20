import { NextRequest, NextResponse } from 'next/server';
import { BadgeStatus } from '@prisma/client';
import { fetchAccessibleCourseDetail, fetchUserByEmail } from '@/app/api/courses/lib/course-queries';
import prisma from '@/lib/prisma';

function normalizeEmail(email?: string | null) {
  const trimmed = email?.trim().toLowerCase();
  return trimmed ? trimmed : null;
}

function normalizeCourseId(courseId?: string | null) {
  const trimmed = courseId?.trim();
  return trimmed ? trimmed : null;
}

// The roster only stores a single display name; split on the first space so the
// export can present separate "First Name" / "Last Name" columns per issue #120.
function splitName(name: string | null) {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return { first: '', last: '' };
  const spaceIndex = trimmed.indexOf(' ');
  if (spaceIndex === -1) return { first: trimmed, last: '' };
  return { first: trimmed.slice(0, spaceIndex), last: trimmed.slice(spaceIndex + 1).trim() };
}

export async function GET(req: NextRequest, context: { params: Promise<{ courseId: string }> }) {
  try {
    const email = normalizeEmail(req.nextUrl.searchParams.get('email'));
    const { courseId: rawCourseId } = await context.params;
    const courseId = normalizeCourseId(rawCourseId);

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    if (!courseId) {
      return NextResponse.json({ error: 'Course id is required' }, { status: 400 });
    }

    const user = await fetchUserByEmail(email);

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const course = await fetchAccessibleCourseDetail(user.id, courseId);

    if (!course) {
      return NextResponse.json(
        { error: 'Course not found or you do not have permission to view it.' },
        { status: 404 }
      );
    }

    // Exporting course-wide student data is an instructor-only action.
    const isInstructor = course.createdById === user.id;

    if (!isInstructor) {
      return NextResponse.json({ error: 'You do not have permission to export this course.' }, { status: 403 });
    }

    // Collect every badge attached to the course through its lesson requirements,
    // preserving lesson order and de-duplicating badges shared across lessons.
    // Track each badge's requirement lessons so we can tell whether a student has
    // actually worked on the badge (see the "Not Started" derivation below).
    const badges: Array<{ id: string; name: string }> = [];
    const seenBadgeIds = new Set<string>();
    const lessonIdsByBadge = new Map<string, Set<string>>();
    for (const lesson of course.lessons) {
      for (const requirement of lesson.badgeRequirements) {
        if (!seenBadgeIds.has(requirement.badge.id)) {
          seenBadgeIds.add(requirement.badge.id);
          badges.push({ id: requirement.badge.id, name: requirement.badge.name });
        }
        const lessonSet = lessonIdsByBadge.get(requirement.badge.id) ?? new Set<string>();
        lessonSet.add(lesson.id);
        lessonIdsByBadge.set(requirement.badge.id, lessonSet);
      }
    }

    const students = course.enrollments.filter((enrollment) => enrollment.role === 'STUDENT');
    const studentIds = students.map((enrollment) => enrollment.student.id);
    const badgeIds = badges.map((badge) => badge.id);
    const requirementLessonIds = [...new Set(course.lessons.map((lesson) => lesson.id))];

    // StudentBadge rows are created at badge-import time for the students enrolled
    // then; a student who joined afterwards has an enrollment but no progress row.
    // So drive the export off enrolled students × course badges rather than the
    // progress rows, and derive each status below.
    const [progressRows, lessonProgressRows] = await Promise.all([
      studentIds.length > 0 && badgeIds.length > 0
        ? prisma.studentBadge.findMany({
            where: { studentId: { in: studentIds }, badgeId: { in: badgeIds } },
            select: { studentId: true, badgeId: true, status: true },
          })
        : Promise.resolve([]),
      studentIds.length > 0 && requirementLessonIds.length > 0
        ? prisma.lessonProgress.findMany({
            where: { studentId: { in: studentIds }, lessonId: { in: requirementLessonIds } },
            select: {
              studentId: true,
              lessonId: true,
              status: true,
              startedAt: true,
              completedAt: true,
              percentComplete: true,
            },
          })
        : Promise.resolve([]),
    ]);

    const statusByStudentBadge = new Map<string, BadgeStatus>();
    for (const progress of progressRows) {
      statusByStudentBadge.set(`${progress.studentId}:${progress.badgeId}`, progress.status);
    }

    // A student has "started" a requirement lesson once it shows any activity.
    // Mirrors the badge-detail route so the export agrees with the dashboard.
    const startedLessonKeys = new Set<string>();
    for (const lp of lessonProgressRows) {
      const started =
        Boolean(lp.startedAt || lp.completedAt) ||
        lp.status === 'IN_PROGRESS' ||
        lp.status === 'COMPLETED' ||
        lp.percentComplete > 0;
      if (started) {
        startedLessonKeys.add(`${lp.studentId}:${lp.lessonId}`);
      }
    }

    // COMPLETED -> Proficient. A missing progress row, or a seeded LEARNING row
    // with no lesson activity, is "Not Started"; anything else is in progress.
    const displayStatus = (studentId: string, badge: { id: string }) => {
      const status = statusByStudentBadge.get(`${studentId}:${badge.id}`);
      if (status === BadgeStatus.COMPLETED) return 'Proficient';

      const lessonStarted = [...(lessonIdsByBadge.get(badge.id) ?? [])].some((lessonId) =>
        startedLessonKeys.has(`${studentId}:${lessonId}`)
      );
      if (!status || (status === BadgeStatus.LEARNING && !lessonStarted)) return 'Not Started';

      return 'Still Learning';
    };

    // Wide/pivot layout (issue #120, "Option B"): one row per student, with a
    // column per badge whose value is the student's status for that badge. Two
    // badges can share a display name, which would collide as object keys, so
    // build a unique column label per badge (suffixing duplicates) while keeping
    // the badge's lesson order for the column sequence.
    const columnLabelByBadgeId = new Map<string, string>();
    const usedColumnLabels = new Set(['First Name', 'Last Name', 'BUID', 'Email']);
    for (const badge of badges) {
      let label = badge.name;
      for (let suffix = 2; usedColumnLabels.has(label); suffix += 1) {
        label = `${badge.name} (${suffix})`;
      }
      usedColumnLabels.add(label);
      columnLabelByBadgeId.set(badge.id, label);
    }

    const rows: Record<string, string>[] = [];
    for (const enrollment of students) {
      const { student } = enrollment;
      const { first, last } = splitName(student.name);

      const row: Record<string, string> = {
        'First Name': first,
        'Last Name': last,
        BUID: student.buid ?? '',
        Email: student.email ?? '',
      };
      for (const badge of badges) {
        row[columnLabelByBadgeId.get(badge.id) as string] = displayStatus(student.id, badge);
      }
      rows.push(row);
    }

    // One row per student now, so order the rows by student name (then email).
    rows.sort(
      (a, b) =>
        a['Last Name'].localeCompare(b['Last Name']) ||
        a['First Name'].localeCompare(b['First Name']) ||
        a.Email.localeCompare(b.Email)
    );

    const safeTitle = course.title.replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '') || 'course';
    // Local date + time; colons are illegal in filenames so use YYYY-MM-DD_HH-MM-SS.
    const now = new Date();
    const pad = (value: number) => String(value).padStart(2, '0');
    const exportDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const exportTime = `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;

    return NextResponse.json({ filename: `${safeTitle}_${exportDate}_${exportTime}.csv`, rows }, { status: 200 });
  } catch (error) {
    console.error('GET /api/courses/[courseId]/export failed:', error);

    return NextResponse.json({ error: 'Failed to export course data' }, { status: 500 });
  }
}
