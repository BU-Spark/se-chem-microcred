import prisma from '@/lib/prisma';

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
  return prisma.enrollment.findMany({
    where: {
      studentId: userId,
      role: { in: ['INSTRUCTOR', 'CHECKER'] },
      // Pending assessor requests don't grant access yet — only active staff
      // enrollments surface in the assessor's course list.
      status: 'ACTIVE',
      course: { createdById: { not: userId } },
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
              status: 'ACTIVE',
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
          slug: true,
          title: true,
          sortOrder: true,
          segments: {
            orderBy: { sortOrder: 'asc' },
            select: {
              id: true,
              title: true,
              duration: true,
              videoUrl: true,
              thumbnailUrl: true,
              sortOrder: true,
            },
          },
          checkpoints: {
            orderBy: { sortOrder: 'asc' },
            select: {
              id: true,
              title: true,
              label: true,
              meta: true,
              questionCount: true,
              timeOffsetSeconds: true,
              sortOrder: true,
              questions: {
                orderBy: { sortOrder: 'asc' },
                select: {
                  prompt: true,
                },
              },
            },
          },
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

                  name: true,
                  rubricGoal: {
                    select: {
                      id: true,
                      name: true,
                      subgoals: {
                        orderBy: { sortOrder: 'asc' },
                        select: {
                          id: true,
                          text: true,
                          passThreshold: true,
                          sortOrder: true,
                          tasks: {
                            orderBy: { sortOrder: 'asc' },
                            select: { id: true, text: true, points: true, sortOrder: true },
                          },
                        },
                      },
                    },
                  },
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
          status: true,
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
              // Progress on the badge's requirement lessons, used to tell a
              // LEARNING row the student has actually worked on apart from one
              // eagerly created at badge creation/import (still "not started").
              lessonProgress: {
                where: { lesson: { badgeRequirements: { some: { badgeId } } } },
                select: {
                  status: true,
                  startedAt: true,
                  completedAt: true,
                  percentComplete: true,
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
          segments: {
            orderBy: { sortOrder: 'asc' },
            take: 1,
            select: { videoUrl: true },
          },
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
                  availableOn: true,
                  closesOn: true,
                  neverCloses: true,
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
              status: 'ACTIVE',
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
          id: true,
          progress: {
            where: {
              studentId: memberId,
            },
            take: 1,
            select: {
              status: true,
              startedAt: true,
              completedAt: true,
              percentComplete: true,
            },
          },
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
          status: true,
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
          id: true,
          progress: {
            where: {
              studentId: memberId,
            },
            take: 1,
            select: {
              status: true,
              startedAt: true,
              completedAt: true,
              percentComplete: true,
            },
          },
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
      role: 'STUDENT',
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
