import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
import { CourseContactType, CourseRole, Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';

type CreateOrUpdateCoursePayload = {
  id?: string;
  title: string;
  sectionCount: number;
  description?: string | null;

  settings?: {
    allowCooldownOverride?: boolean;
    allowAssessorMessages?: boolean;
    allowCrossSectionView?: boolean;
  };

  contacts?: Array<{
    type: CourseContactType;
    name: string;
    email: string;
    avatarUrl?: string | null;
  }>;

  roster?: Array<{
    email?: string | null;
    name?: string | null;
    buid?: string | null;
    role?: CourseRole;
    section?: string | null;
  }>;
};

function normalizeString(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeEmail(email?: string | null) {
  const trimmed = email?.trim().toLowerCase();
  return trimmed ? trimmed : null;
}

function parseSections(sectionValue?: string | null) {
  return Array.from(
    new Set(
      (sectionValue ?? '')
        .split(',')
        .map((section) => section.trim())
        .filter(Boolean)
    )
  );
}

function badRequest(message: string, details?: unknown) {
  return NextResponse.json({ error: message, details: details ?? null }, { status: 400 });
}
export async function POST(req: NextRequest) {
  try {
    const clerkUser = await currentUser();

    if (!clerkUser?.emailAddresses?.[0]?.emailAddress) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const creatorEmail = normalizeEmail(clerkUser.emailAddresses[0].emailAddress);

    if (!creatorEmail) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await req.json()) as CreateOrUpdateCoursePayload;

    const courseId = normalizeString(body.id);
    const title = normalizeString(body.title);
    const description = normalizeString(body.description);
    const sectionCount = Number(body.sectionCount);

    if (!title) {
      return badRequest('Course title is required.');
    }

    const contacts = (body.contacts ?? []).map((contact) => ({
      type: contact.type,
      name: normalizeString(contact.name),
      email: normalizeEmail(contact.email),
      avatarUrl: normalizeString(contact.avatarUrl),
    }));

    for (const contact of contacts) {
      if (!contact.type || !contact.name || !contact.email) {
        return badRequest('Each contact must include type, name, and email.');
      }
    }

    const roster = (body.roster ?? []).map((member) => ({
      email: normalizeEmail(member.email),
      name: normalizeString(member.name),
      buid: normalizeString(member.buid),
      role: member.role ?? CourseRole.STUDENT,
      sections: parseSections(member.section),
    }));

    for (const member of roster) {
      if (!member.email && !member.buid) {
        return badRequest('Each roster member must include at least a BUID or an email.');
      }

      if (member.role === CourseRole.INSTRUCTOR && member.sections.length > 0) {
        return badRequest('Instructor roster members must not have a section.');
      }

      if (member.role === CourseRole.STUDENT && member.sections.length > 1) {
        return badRequest('Student roster members can only belong to one section.');
      }
    }

    const creator = await prisma.user.findUnique({
      where: { email: creatorEmail },
    });

    if (!creator) {
      return NextResponse.json({ error: 'Creator user record was not found in the database.' }, { status: 404 });
    }

    const txResult = await prisma.$transaction(
      async (tx) => {
        let existingCourse: { id: string; createdById: string | null } | null = null;

        if (courseId) {
          existingCourse = await tx.course.findFirst({
            where: {
              id: courseId,
              createdById: creator.id,
            },
            select: {
              id: true,
              createdById: true,
            },
          });

          if (!existingCourse) {
            return {
              error: NextResponse.json(
                {
                  error: 'Course not found or you do not have permission to update it.',
                },
                { status: 404 }
              ),
            };
          }
        }

        const isUpdate = Boolean(existingCourse);
        let savedCourseId: string;

        if (isUpdate && existingCourse) {
          const updated = await tx.course.update({
            where: { id: existingCourse.id },
            data: {
              title,
              sectionCount,
              description,
            },
            select: { id: true },
          });

          savedCourseId = updated.id;

          await tx.courseSettings.upsert({
            where: { courseId: savedCourseId },
            update: {
              allowCooldownOverride: body.settings?.allowCooldownOverride ?? false,
              allowAssessorMessages: body.settings?.allowAssessorMessages ?? false,
              allowCrossSectionView: body.settings?.allowCrossSectionView ?? false,
            },
            create: {
              courseId: savedCourseId,
              allowCooldownOverride: body.settings?.allowCooldownOverride ?? false,
              allowAssessorMessages: body.settings?.allowAssessorMessages ?? false,
              allowCrossSectionView: body.settings?.allowCrossSectionView ?? false,
            },
          });

          await tx.courseContact.deleteMany({
            where: { courseId: savedCourseId },
          });

          if (contacts.length > 0) {
            await tx.courseContact.createMany({
              data: contacts.map((contact) => ({
                courseId: savedCourseId,
                type: contact.type,
                name: contact.name!,
                email: contact.email!,
                avatarUrl: contact.avatarUrl,
              })),
            });
          }

          await tx.enrollment.deleteMany({
            where: {
              courseId: savedCourseId,
              NOT: {
                studentId: creator.id,
              },
            },
          });
        } else {
          const created = await tx.course.create({
            data: {
              title,
              sectionCount,
              description,
              createdById: creator.id,
              settings: {
                create: {
                  allowCooldownOverride: body.settings?.allowCooldownOverride ?? false,
                  allowAssessorMessages: body.settings?.allowAssessorMessages ?? false,
                  allowCrossSectionView: body.settings?.allowCrossSectionView ?? false,
                },
              },
            },
            select: { id: true },
          });

          savedCourseId = created.id;

          if (contacts.length > 0) {
            await tx.courseContact.createMany({
              data: contacts.map((contact) => ({
                courseId: savedCourseId,
                type: contact.type,
                name: contact.name!,
                email: contact.email!,
                avatarUrl: contact.avatarUrl,
              })),
            });
          }
        }

        const creatorEnrollment = await tx.enrollment.upsert({
          where: {
            studentId_courseId: {
              studentId: creator.id,
              courseId: savedCourseId,
            },
          },
          update: {
            role: CourseRole.INSTRUCTOR,
          },
          create: {
            studentId: creator.id,
            courseId: savedCourseId,
            role: CourseRole.INSTRUCTOR,
          },
          select: { id: true },
        });

        await tx.enrollmentSection.deleteMany({
          where: { enrollmentId: creatorEnrollment.id },
        });

        const rosterBuids = roster.map((r) => r.buid).filter((buid): buid is string => Boolean(buid));

        const rosterEmails = roster.map((r) => r.email).filter((email): email is string => Boolean(email));

        const existingUsers =
          rosterBuids.length || rosterEmails.length
            ? await tx.user.findMany({
                where: {
                  OR: [
                    ...(rosterBuids.length ? [{ buid: { in: rosterBuids } }] : []),
                    ...(rosterEmails.length ? [{ email: { in: rosterEmails } }] : []),
                  ],
                },
              })
            : [];

        const userByBuid = new Map(existingUsers.filter((user) => user.buid).map((user) => [user.buid!, user]));

        const userByEmail = new Map(
          existingUsers.filter((user) => user.email).map((user) => [user.email!.toLowerCase(), user])
        );

        const analyticsStudentIds = new Set<string>();
        analyticsStudentIds.add(creator.id);
        const enrollmentInputs = new Map<
          string,
          {
            role: CourseRole;
            sections: Set<string>;
          }
        >();

        for (const member of roster) {
          let dbUser =
            (member.buid ? userByBuid.get(member.buid) : undefined) ??
            (member.email ? userByEmail.get(member.email) : undefined);

          if (!dbUser) {
            dbUser = await tx.user.create({
              data: {
                email: member.email,
                name: member.name,
                buid: member.buid,
              },
            });

            if (dbUser.buid) {
              userByBuid.set(dbUser.buid, dbUser);
            }
            if (dbUser.email) {
              userByEmail.set(dbUser.email.toLowerCase(), dbUser);
            }
          } else {
            const updates: {
              name?: string | null;
              buid?: string | null;
              email?: string | null;
            } = {};

            if (!dbUser.name && member.name) updates.name = member.name;
            if (!dbUser.buid && member.buid) updates.buid = member.buid;
            if (!dbUser.email && member.email) updates.email = member.email;

            if (Object.keys(updates).length > 0) {
              dbUser = await tx.user.update({
                where: { id: dbUser.id },
                data: updates,
              });

              if (dbUser.buid) {
                userByBuid.set(dbUser.buid, dbUser);
              }
              if (dbUser.email) {
                userByEmail.set(dbUser.email.toLowerCase(), dbUser);
              }
            }
          }

          analyticsStudentIds.add(dbUser.id);

          if (dbUser.id === creator.id) {
            continue;
          }

          const existingEnrollment = enrollmentInputs.get(dbUser.id);

          if (existingEnrollment) {
            if (existingEnrollment.role !== member.role) {
              return {
                error: badRequest('A roster member cannot be assigned multiple roles in the same course.', {
                  userId: dbUser.id,
                  roles: [existingEnrollment.role, member.role],
                }),
              };
            }

            for (const section of member.sections) {
              existingEnrollment.sections.add(section);
            }

            continue;
          }

          enrollmentInputs.set(dbUser.id, {
            role: member.role,
            sections: new Set(member.sections),
          });
        }

        for (const [userId, enrollmentInput] of enrollmentInputs) {
          const enrollment = await tx.enrollment.upsert({
            where: {
              studentId_courseId: {
                studentId: userId,
                courseId: savedCourseId,
              },
            },
            update: {
              role: enrollmentInput.role,
            },
            create: {
              studentId: userId,
              courseId: savedCourseId,
              role: enrollmentInput.role,
            },
            select: { id: true },
          });

          await tx.enrollmentSection.deleteMany({
            where: { enrollmentId: enrollment.id },
          });

          const sections = Array.from(enrollmentInput.sections);

          if (sections.length > 0) {
            await tx.enrollmentSection.createMany({
              data: sections.map((section) => ({
                enrollmentId: enrollment.id,
                section,
              })),
            });
          }
        }

        const fullCourse = await tx.course.findUnique({
          where: { id: savedCourseId },
          include: {
            settings: true,
            contacts: {
              orderBy: { type: 'asc' },
            },
            enrollments: {
              include: {
                sections: {
                  orderBy: { section: 'asc' },
                },
                student: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                    buid: true,
                  },
                },
              },
              orderBy: { createdAt: 'asc' },
            },
          },
        });

        return {
          course: fullCourse,
          analyticsStudentIds: Array.from(analyticsStudentIds),
          updated: isUpdate,
        };
      },
      {
        timeout: 15000,
      }
    );

    if ('error' in txResult) {
      return txResult.error;
    }

    await prisma.studentAnalytics.createMany({
      data: txResult.analyticsStudentIds.map((studentId) => ({
        studentId,
        hoursLearning: 0,
        badgesCompleted: 0,
        badgesReadyForAssessment: 0,
        badgesNotAttempted: 0,
        questionsAnswered: 0,
        averageAssessmentScore: 0,
        highestAssessmentScore: 0,
      })),
      skipDuplicates: true,
    });

    return NextResponse.json(
      {
        message: txResult.updated ? 'Course updated successfully.' : 'Course created successfully.',
        course: txResult.course,
      },
      { status: txResult.updated ? 200 : 201 }
    );
  } catch (error) {
    console.error('POST /api/courses failed:', error);

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json(
        {
          error: 'Unique constraint failed. A user, contact, analytics record, or enrollment already exists.',
        },
        { status: 409 }
      );
    }

    return NextResponse.json({ error: 'Failed to save course.' }, { status: 500 });
  }
}
