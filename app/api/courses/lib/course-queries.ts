import prisma from '@/lib/prisma';

const SEEDED_DEMO_EMAIL = 'nithin.senthilvel@gmail.com';
const SEEDED_DEMO_COURSE_CODE = 'CHEM101';

export async function fetchUserByEmail(email: string) {
  return prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      name: true,
      buid: true,
      avatar: { select: { base: true } },
    },
  });
}

export async function fetchCreatedBadgeDetail(userId: string, courseId: string, badgeId: string) {
  return prisma.course.findFirst({
    where: {
      id: courseId,
      createdById: userId,
      lessons: {
        some: {
          badgeRequirements: {
            some: {
              badgeId,
            },
          },
        },
      },
    },
    select: {
      id: true,
      title: true,
      sectionCount: true,
      createdBy: {
        select: {
          id: true,
          name: true,
          email: true,
          buid: true,
        },
      },
      lessons: {
        where: {
          badgeRequirements: {
            some: {
              badgeId,
            },
          },
        },
        orderBy: { sortOrder: 'asc' },
        select: {
          id: true,
          title: true,
          sortOrder: true,
          badgeRequirements: {
            where: { badgeId },
            select: {
              id: true,
              summary: true,
              badge: {
                select: {
                  id: true,
                  description: true,
                  slug: true,
                  category: true,
                  name: true,
                },
              },
            },
          },
        },
      },
      enrollments: {
        where: {
          role: 'STUDENT',
        },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          role: true,
          sections: {
            orderBy: { section: 'asc' },
            select: { section: true },
          },
          student: {
            select: {
              id: true,
              name: true,
              email: true,
              buid: true,
              badgeProgress: {
                where: { badgeId },
                take: 1,
                select: {
                  id: true,
                  badgeId: true,
                  status: true,
                  awardedAt: true,
                  score: true,
                  updatedAt: true,
                },
              },
            },
          },
        },
      },
    },
  });
}

export async function fetchCreatedCourses(userId: string) {
  return prisma.course.findMany({
    where: {
      createdById: userId,
    },
    include: {
      settings: true,
      lessons: {
        orderBy: { sortOrder: 'asc' },
        take: 1,
        select: {
          thumbnailUrl: true,
        },
      },
      contacts: {
        orderBy: { type: 'asc' },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function fetchAssessorCourseEnrollments(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  const includeSeededDemoCourse = user?.email?.toLowerCase() === SEEDED_DEMO_EMAIL;

  return prisma.enrollment.findMany({
    where: {
      studentId: userId,
      role: { in: ['INSTRUCTOR', 'CHECKER'] },
      OR: [
        { course: { createdById: { not: userId } } },
        ...(includeSeededDemoCourse ? [{ course: { code: SEEDED_DEMO_COURSE_CODE } }] : []),
      ],
    },
    include: {
      sections: {
        orderBy: { section: 'asc' },
      },
      course: {
        include: {
          settings: true,
          lessons: {
            orderBy: { sortOrder: 'asc' },
            take: 1,
            select: {
              thumbnailUrl: true,
            },
          },
          contacts: {
            orderBy: { type: 'asc' },
          },
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true,
              buid: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function fetchCreatedCourseDetail(userId: string, courseId: string) {
  return prisma.course.findFirst({
    where: {
      id: courseId,
      createdById: userId,
    },
    include: {
      settings: true,
      createdBy: {
        select: {
          id: true,
          name: true,
          email: true,
          buid: true,
        },
      },
      contacts: {
        orderBy: [{ type: 'asc' }, { name: 'asc' }],
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
        orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
      },
      lessons: {
        orderBy: { sortOrder: 'asc' },
        select: {
          id: true,
          slug: true,
          title: true,
          summary: true,
          thumbnailUrl: true,
          sortOrder: true,
          badgeRequirements: {
            orderBy: { createdAt: 'asc' },
            select: {
              id: true,
              summary: true,
              badge: {
                select: {
                  id: true,
                  slug: true,
                  name: true,
                  description: true,
                  category: true,
                },
              },
            },
          },
        },
      },
    },
  });
}

export async function fetchAccessibleBadgeDetail(userId: string, courseId: string, badgeId: string) {
  return prisma.course.findFirst({
    where: {
      id: courseId,
      OR: [
        { createdById: userId },
        {
          enrollments: {
            some: {
              studentId: userId,
              role: { in: ['INSTRUCTOR', 'CHECKER'] },
            },
          },
        },
      ],
      lessons: {
        some: {
          badgeRequirements: {
            some: {
              badgeId,
            },
          },
        },
      },
    },
    select: {
      id: true,
      title: true,
      sectionCount: true,
      createdBy: {
        select: {
          id: true,
          name: true,
          email: true,
          buid: true,
        },
      },
      lessons: {
        where: {
          badgeRequirements: {
            some: {
              badgeId,
            },
          },
        },
        orderBy: { sortOrder: 'asc' },
        select: {
          id: true,
          title: true,
          sortOrder: true,
          badgeRequirements: {
            where: { badgeId },
            select: {
              id: true,
              summary: true,
              badge: {
                select: {
                  id: true,
                  description: true,
                  slug: true,
                  category: true,
                  name: true,
                },
              },
            },
          },
        },
      },
      enrollments: {
        where: {
          role: 'STUDENT',
        },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          role: true,
          sections: {
            orderBy: { section: 'asc' },
            select: { section: true },
          },
          student: {
            select: {
              id: true,
              name: true,
              email: true,
              buid: true,
              badgeProgress: {
                where: { badgeId },
                take: 1,
                select: {
                  id: true,
                  badgeId: true,
                  status: true,
                  awardedAt: true,
                  score: true,
                  updatedAt: true,
                },
              },
            },
          },
        },
      },
    },
  });
}

export async function fetchAccessibleCourseDetail(userId: string, courseId: string) {
  return prisma.course.findFirst({
    where: {
      id: courseId,
      OR: [
        { createdById: userId },
        {
          enrollments: {
            some: {
              studentId: userId,
            },
          },
        },
      ],
    },
    include: {
      settings: true,
      createdBy: {
        select: {
          id: true,
          name: true,
          email: true,
          buid: true,
          avatar: { select: { base: true } },
        },
      },
      contacts: {
        orderBy: [{ type: 'asc' }, { name: 'asc' }],
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
        orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
      },
      lessons: {
        orderBy: { sortOrder: 'asc' },
        select: {
          id: true,
          slug: true,
          title: true,
          summary: true,
          thumbnailUrl: true,
          sortOrder: true,
          badgeRequirements: {
            orderBy: { createdAt: 'asc' },
            select: {
              id: true,
              summary: true,
              badge: {
                select: {
                  id: true,
                  slug: true,
                  name: true,
                  description: true,
                  category: true,
                },
              },
            },
          },
        },
      },
    },
  });
}

export async function fetchAccessibleCourseMemberDetail(userId: string, courseId: string, memberId: string) {
  return prisma.course.findFirst({
    where: {
      id: courseId,
      OR: [
        { createdById: userId },
        {
          enrollments: {
            some: {
              studentId: userId,
              role: { in: ['INSTRUCTOR', 'CHECKER'] },
            },
          },
        },
      ],
      enrollments: {
        some: {
          studentId: memberId,
        },
      },
    },
    select: {
      id: true,
      title: true,
      settings: true,
      createdById: true,
      createdBy: {
        select: {
          id: true,
          name: true,
          email: true,
          buid: true,
        },
      },
      contacts: {
        orderBy: [{ type: 'asc' }, { name: 'asc' }],
      },
      lessons: {
        orderBy: { sortOrder: 'asc' },
        select: {
          badgeRequirements: {
            orderBy: { createdAt: 'asc' },
            select: {
              id: true,
              badge: {
                select: {
                  id: true,
                  slug: true,
                  name: true,
                  description: true,
                  category: true,
                },
              },
            },
          },
        },
      },
      enrollments: {
        where: {
          studentId: { in: Array.from(new Set([userId, memberId])) },
        },
        select: {
          id: true,
          role: true,
          sections: {
            orderBy: { section: 'asc' },
            select: {
              section: true,
            },
          },
          student: {
            select: {
              id: true,
              name: true,
              email: true,
              buid: true,
              gender: true,
              raceEthnicity: true,
              parentalEducation: true,
              pellGrantQualified: true,
              createdAt: true,
              avatar: true,
              badgeProgress: {
                where: {
                  badge: {
                    requirements: {
                      some: {
                        lesson: {
                          is: {
                            courseId,
                          },
                        },
                      },
                    },
                  },
                },
                orderBy: { updatedAt: 'asc' },
                select: {
                  id: true,
                  badgeId: true,
                  status: true,
                  awardedAt: true,
                  score: true,
                  badge: {
                    select: {
                      id: true,
                      slug: true,
                      name: true,
                      description: true,
                      category: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
}

export async function fetchCreatedCourseMemberDetail(userId: string, courseId: string, memberId: string) {
  return prisma.course.findFirst({
    where: {
      id: courseId,
      createdById: userId,
      enrollments: {
        some: {
          studentId: memberId,
        },
      },
    },
    select: {
      id: true,
      title: true,
      createdBy: {
        select: {
          id: true,
          name: true,
          email: true,
          buid: true,
        },
      },
      contacts: {
        orderBy: [{ type: 'asc' }, { name: 'asc' }],
      },
      lessons: {
        orderBy: { sortOrder: 'asc' },
        select: {
          badgeRequirements: {
            orderBy: { createdAt: 'asc' },
            select: {
              id: true,
              badge: {
                select: {
                  id: true,
                  slug: true,
                  name: true,
                  description: true,
                  category: true,
                },
              },
            },
          },
        },
      },
      enrollments: {
        where: {
          studentId: memberId,
        },
        take: 1,
        select: {
          id: true,
          role: true,
          sections: {
            orderBy: { section: 'asc' },
            select: {
              section: true,
            },
          },
          student: {
            select: {
              id: true,
              name: true,
              email: true,
              buid: true,
              gender: true,
              raceEthnicity: true,
              parentalEducation: true,
              pellGrantQualified: true,
              createdAt: true,
              avatar: true,
              badgeProgress: {
                where: {
                  badge: {
                    requirements: {
                      some: {
                        lesson: {
                          is: {
                            courseId,
                          },
                        },
                      },
                    },
                  },
                },
                orderBy: { updatedAt: 'asc' },
                select: {
                  id: true,
                  badgeId: true,
                  status: true,
                  awardedAt: true,
                  score: true,
                  badge: {
                    select: {
                      id: true,
                      slug: true,
                      name: true,
                      description: true,
                      category: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
}

export async function fetchEnrolledCourses(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  const includeSeededDemoCourse = user?.email?.toLowerCase() === SEEDED_DEMO_EMAIL;

  return prisma.enrollment.findMany({
    where: {
      studentId: userId,
      OR: [{ role: 'STUDENT' }, ...(includeSeededDemoCourse ? [{ course: { code: SEEDED_DEMO_COURSE_CODE } }] : [])],
    },
    include: {
      course: {
        include: {
          settings: true,
          lessons: {
            orderBy: { sortOrder: 'asc' },
            take: 1,
            select: {
              thumbnailUrl: true,
              segments: {
                orderBy: { sortOrder: 'asc' },
                take: 1,
                select: {
                  videoUrl: true,
                  thumbnailUrl: true,
                },
              },
            },
          },
          contacts: {
            orderBy: { type: 'asc' },
          },
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true,
              buid: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
}
