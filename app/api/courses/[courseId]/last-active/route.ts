// Issue #328: instructor-only last-active timestamps for a course's student roster.
import { NextRequest, NextResponse } from 'next/server';

import { fetchCourseStudentEmails } from '@/app/api/courses/lib/course-queries';
import { ensureCurrentUser } from '@/app/api/courses/lib/ensure-user';
import { fetchClerkLastActiveByEmail } from '@/lib/clerk/last-active';
import prisma from '@/lib/prisma';
import { normalizeEmail } from '@/lib/text/email';

export type CourseLastActiveResponse = {
  // Keyed by student id (the roster row's memberId). null = no Clerk activity recorded.
  lastActive: Record<string, string | null>;
  fetchedAt: string;
};

// Kept off GET /api/courses/[courseId] on purpose: that route returns every
// enrollment to every member, and students must not see classmates' activity.
export async function GET(_req: NextRequest, context: { params: Promise<{ courseId: string }> }) {
  try {
    const current = await ensureCurrentUser();
    if (!current) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { courseId: rawCourseId } = await context.params;
    const courseId = rawCourseId?.trim();
    if (!courseId) return NextResponse.json({ error: 'A course is required.' }, { status: 400 });

    const course = await prisma.course.findUnique({ where: { id: courseId }, select: { createdById: true } });
    if (!course) return NextResponse.json({ error: 'Course not found.' }, { status: 404 });
    if (course.createdById !== current.id) {
      return NextResponse.json({ error: 'Only the course instructor can view roster activity.' }, { status: 403 });
    }

    const students = await fetchCourseStudentEmails(courseId);

    let byEmail: Map<string, number | null>;
    try {
      byEmail = await fetchClerkLastActiveByEmail(students.map((student) => student.email));
    } catch (error) {
      console.error('Failed to load last-active times from Clerk:', error);
      return NextResponse.json({ error: 'Unable to load last-active times.' }, { status: 502 });
    }

    const lastActive: Record<string, string | null> = {};
    for (const student of students) {
      const email = normalizeEmail(student.email);
      const timestamp = email ? byEmail.get(email) : null;
      lastActive[student.studentId] = typeof timestamp === 'number' ? new Date(timestamp).toISOString() : null;
    }

    const body: CourseLastActiveResponse = { lastActive, fetchedAt: new Date().toISOString() };
    return NextResponse.json(body);
  } catch (error) {
    console.error('Failed to load course last-active times:', error);
    return NextResponse.json({ error: 'Unable to load last-active times.' }, { status: 500 });
  }
}
