import prisma from '@/lib/prisma';

export async function fetchUserByEmail(email: string) {
  return prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      name: true,
      buid: true,
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
      enrollments: {
        include: {
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
  return prisma.enrollment.findMany({
    where: {
      studentId: userId,
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
