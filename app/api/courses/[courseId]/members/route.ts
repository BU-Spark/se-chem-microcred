import { NextRequest, NextResponse } from 'next/server';
import { CourseRole, Prisma } from '@prisma/client';

import { ensureCurrentUser } from '@/app/api/courses/lib/ensure-user';
import prisma from '@/lib/prisma';

type MemberInput = {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  buid?: string | null;
  sections?: string[] | string | null;
};

type AddMembersPayload = {
  role?: CourseRole | null;
  members?: MemberInput[] | null;
};

function normalize(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed || null;
}

function parseSections(value?: string[] | string | null) {
  const entries = Array.isArray(value) ? value : (value ?? '').split('|');
  return Array.from(new Set(entries.map((section) => section.trim()).filter(Boolean)));
}

export async function POST(req: NextRequest, context: { params: Promise<{ courseId: string }> }) {
  try {
    const current = await ensureCurrentUser();
    if (!current) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { courseId: rawCourseId } = await context.params;
    const courseId = normalize(rawCourseId);
    const body = (await req.json()) as AddMembersPayload;
    const role = body.role;

    if (!courseId || (role !== CourseRole.STUDENT && role !== CourseRole.CHECKER)) {
      return NextResponse.json({ error: 'A course and valid roster role are required.' }, { status: 400 });
    }

    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: { createdById: true },
    });
    if (!course) return NextResponse.json({ error: 'Course not found.' }, { status: 404 });
    if (course.createdById !== current.id) {
      return NextResponse.json({ error: 'Only the course instructor can add roster members.' }, { status: 403 });
    }

    const members = (body.members ?? []).map((member) => {
      const firstName = normalize(member.firstName);
      const lastName = normalize(member.lastName);
      const email = normalize(member.email)?.toLowerCase() ?? null;
      const buid = normalize(member.buid);
      const sections = parseSections(member.sections);
      return { name: [firstName, lastName].filter(Boolean).join(' ') || null, email, buid, sections };
    });

    if (members.length === 0) {
      return NextResponse.json({ error: 'Add at least one roster member.' }, { status: 400 });
    }
    if (members.some((member) => !member.email && !member.buid)) {
      return NextResponse.json({ error: 'Every roster member must include an email or BUID.' }, { status: 400 });
    }
    if (role === CourseRole.STUDENT && members.some((member) => member.sections.length > 1)) {
      return NextResponse.json({ error: 'Students can only belong to one section.' }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const buids = members.map((member) => member.buid).filter((value): value is string => Boolean(value));
      const emails = members.map((member) => member.email).filter((value): value is string => Boolean(value));
      let users = await tx.user.findMany({
        where: {
          OR: [
            ...(buids.length ? [{ buid: { in: buids } }] : []),
            ...(emails.length ? [{ email: { in: emails } }] : []),
          ],
        },
      });
      const byBuid = new Map(users.filter((user) => user.buid).map((user) => [user.buid!, user]));
      const byEmail = new Map(users.filter((user) => user.email).map((user) => [user.email!.toLowerCase(), user]));
      const resolveUser = (member: (typeof members)[number]) =>
        (member.buid ? byBuid.get(member.buid) : undefined) ?? (member.email ? byEmail.get(member.email) : undefined);

      const newUsers = members
        .filter((member) => !resolveUser(member))
        .filter((member, index, entries) => {
          const key = member.buid || member.email;
          return entries.findIndex((candidate) => (candidate.buid || candidate.email) === key) === index;
        })
        .map(({ name, email, buid }) => ({ name, email, buid }));
      if (newUsers.length) {
        await tx.user.createMany({ data: newUsers, skipDuplicates: true });
        users = await tx.user.findMany({
          where: {
            OR: [
              ...(buids.length ? [{ buid: { in: buids } }] : []),
              ...(emails.length ? [{ email: { in: emails } }] : []),
            ],
          },
        });
        for (const user of users) {
          if (user.buid) byBuid.set(user.buid, user);
          if (user.email) byEmail.set(user.email.toLowerCase(), user);
        }
      }

      const uniqueMembers = new Map<
        string,
        { user: NonNullable<ReturnType<typeof resolveUser>>; sections: Set<string> }
      >();
      for (const member of members) {
        const user = resolveUser(member);
        if (!user) throw new Error('Unable to create roster member.');
        if (user.id === current.id) throw new Error('The course instructor cannot be added with another role.');
        const entry = uniqueMembers.get(user.id) ?? { user, sections: new Set<string>() };
        member.sections.forEach((section) => entry.sections.add(section));
        uniqueMembers.set(user.id, entry);
      }

      const existingEnrollments = await tx.enrollment.findMany({
        where: { courseId, studentId: { in: Array.from(uniqueMembers.keys()) } },
      });
      const conflicts = existingEnrollments.filter((enrollment) => enrollment.role !== role);
      if (conflicts.length) throw new Error('A roster member already has a different role in this course.');

      await tx.enrollment.createMany({
        data: Array.from(uniqueMembers.keys()).map((studentId) => ({ studentId, courseId, role, status: 'ACTIVE' })),
        skipDuplicates: true,
      });
      const enrollments = await tx.enrollment.findMany({
        where: { courseId, studentId: { in: Array.from(uniqueMembers.keys()) } },
        select: { id: true, studentId: true },
      });
      const enrollmentByUser = new Map(enrollments.map((enrollment) => [enrollment.studentId, enrollment.id]));
      const sectionData = Array.from(uniqueMembers.entries()).flatMap(([studentId, member]) =>
        Array.from(member.sections).map((section) => ({ enrollmentId: enrollmentByUser.get(studentId)!, section }))
      );
      if (sectionData.length) await tx.enrollmentSection.createMany({ data: sectionData, skipDuplicates: true });

      const studentIds = role === CourseRole.STUDENT ? Array.from(uniqueMembers.keys()) : [];
      if (studentIds.length) {
        const requirements = await tx.badgeRequirement.findMany({
          where: { lesson: { courseId } },
          select: { badgeId: true },
          distinct: ['badgeId'],
        });
        if (requirements.length) {
          await tx.studentBadge.createMany({
            data: studentIds.flatMap((studentId) => requirements.map(({ badgeId }) => ({ studentId, badgeId }))),
            skipDuplicates: true,
          });
        }
      }
      await tx.studentAnalytics.createMany({
        data: Array.from(uniqueMembers.keys()).map((studentId) => ({ studentId })),
        skipDuplicates: true,
      });
      return uniqueMembers.size;
    });

    return NextResponse.json({ message: `${result} roster member${result === 1 ? '' : 's'} added.`, count: result });
  } catch (error) {
    console.error('POST /api/courses/[courseId]/members failed:', error);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ error: 'A roster member has a conflicting email or BUID.' }, { status: 409 });
    }
    const message = error instanceof Error ? error.message : 'Unable to add roster members.';
    const status = message.includes('different role') || message.includes('instructor cannot') ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
