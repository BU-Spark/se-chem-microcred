import { BadgeStatus, CourseRole, EnrollmentStatus } from '@prisma/client';
import { currentUser } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getPublicOrigin } from '@/lib/requestOrigin';
import { isCoolingDown } from '@/lib/badgeState';

function normalizeId(value: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function assessmentUrl(request: Request, courseId: string, studentId: string, badgeId: string) {
  return new URL(
    `/assessments/${encodeURIComponent(courseId)}/students/${encodeURIComponent(studentId)}/badges/${encodeURIComponent(
      badgeId
    )}`,
    getPublicOrigin(request)
  );
}

function redirectHomeWithAssessmentNotice(
  request: Request,
  code: 'invalid' | 'denied' | 'not-ready',
  message = 'You do not have permission to assess this badge.'
) {
  const redirectUrl = new URL('/', getPublicOrigin(request));
  redirectUrl.searchParams.set('assessmentAccess', code);
  redirectUrl.searchParams.set('assessmentMessage', message);
  return NextResponse.redirect(redirectUrl);
}

type AssessmentQrCourse = {
  createdById: string | null;
  settings: { allowCrossSectionView: boolean } | null;
  enrollments: Array<{
    role: CourseRole;
    status: EnrollmentStatus;
    sections: Array<{ section: string }>;
    student: {
      id: string;
      badgeProgress: Array<{ id: string; status: BadgeStatus; cooldownUntil: Date | null }>;
    };
  }>;
};

function canAssessQrCourse(course: AssessmentQrCourse, assessorId: string, studentId: string) {
  const targetEnrollment = course.enrollments.find((enrollment) => enrollment.student.id === studentId);
  const assessorEnrollment = course.enrollments.find((enrollment) => enrollment.student.id === assessorId);
  const isCourseCreator = course.createdById === assessorId;
  const assessorRole =
    isCourseCreator || assessorEnrollment?.status === EnrollmentStatus.ACTIVE ? assessorEnrollment?.role : undefined;
  const effectiveAssessorRole = isCourseCreator ? CourseRole.INSTRUCTOR : assessorRole;

  if (!targetEnrollment || targetEnrollment.role !== CourseRole.STUDENT || !effectiveAssessorRole) {
    return false;
  }

  if (effectiveAssessorRole === CourseRole.STUDENT) {
    return false;
  }

  if (effectiveAssessorRole === CourseRole.CHECKER && !course.settings?.allowCrossSectionView) {
    const assessorSections = new Set(assessorEnrollment?.sections.map((assignment) => assignment.section) ?? []);
    const studentSections = targetEnrollment.sections.map((assignment) => assignment.section);
    return studentSections.length === 0 || studentSections.some((section) => assessorSections.has(section));
  }

  return effectiveAssessorRole === CourseRole.INSTRUCTOR || effectiveAssessorRole === CourseRole.CHECKER;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const courseId = normalizeId(url.searchParams.get('courseId'));
  const studentId = normalizeId(url.searchParams.get('studentId'));
  const badgeId = normalizeId(url.searchParams.get('badgeId'));

  if (!courseId || !studentId || !badgeId) {
    return redirectHomeWithAssessmentNotice(
      request,
      'invalid',
      'This assessment QR code is missing required information.'
    );
  }

  const clerkUser = await currentUser();
  const email = clerkUser?.emailAddresses?.[0]?.emailAddress?.trim().toLowerCase();

  if (!email) {
    const signInUrl = new URL('/sign-in', getPublicOrigin(request));
    signInUrl.searchParams.set('redirect_url', url.pathname + url.search);
    return NextResponse.redirect(signInUrl);
  }

  const assessor = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (!assessor) {
    return redirectHomeWithAssessmentNotice(request, 'denied', 'We could not find an assessor account for you.');
  }

  const course = await prisma.course.findFirst({
    where: {
      id: courseId,
      lessons: {
        some: {
          badgeRequirements: {
            some: { badgeId },
          },
        },
      },
      enrollments: {
        some: { studentId },
      },
      OR: [
        { createdById: assessor.id },
        {
          enrollments: {
            some: {
              studentId: assessor.id,
              role: { in: [CourseRole.INSTRUCTOR, CourseRole.CHECKER] },
              status: EnrollmentStatus.ACTIVE,
            },
          },
        },
      ],
    },
    select: {
      createdById: true,
      settings: { select: { allowCrossSectionView: true } },
      enrollments: {
        where: {
          studentId: { in: Array.from(new Set([assessor.id, studentId])) },
        },
        select: {
          role: true,
          status: true,
          sections: {
            orderBy: { section: 'asc' },
            select: { section: true },
          },
          student: {
            select: {
              id: true,
              badgeProgress: {
                where: { badgeId },
                take: 1,
                select: { id: true, status: true, cooldownUntil: true },
              },
            },
          },
        },
      },
    },
  });

  if (!course || !canAssessQrCourse(course, assessor.id, studentId)) {
    return redirectHomeWithAssessmentNotice(request, 'denied');
  }

  const targetEnrollment = course.enrollments.find((enrollment) => enrollment.student.id === studentId);
  const badgeProgress = targetEnrollment?.student.badgeProgress[0] ?? null;

  if (!badgeProgress) {
    return redirectHomeWithAssessmentNotice(request, 'denied', 'Badge progress was not found for this student.');
  }

  if (badgeProgress.status !== BadgeStatus.READY_FOR_ASSESSMENT) {
    return redirectHomeWithAssessmentNotice(request, 'not-ready', 'This badge is not ready for assessment yet.');
  }

  // Reassessment is gated by the cooldown window: block while now < cooldownUntil.
  if (isCoolingDown(badgeProgress.cooldownUntil)) {
    return redirectHomeWithAssessmentNotice(request, 'not-ready', 'This badge is in its reassessment cooldown period.');
  }

  return NextResponse.redirect(assessmentUrl(request, courseId, studentId, badgeId));
}
