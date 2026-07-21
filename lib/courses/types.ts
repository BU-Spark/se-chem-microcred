import { CourseRole, EnrollmentRole, EnrollmentSummary } from '../enrollment/types';

export type CourseContact = {
  id: string;
  type: CourseRole;
  name: string;
  email: string;
  avatarUrl: string | null;
  avatarBase: string | null;
};

export type CourseBadge = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
};

export type CourseLesson = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  thumbnailUrl: string | null;
  sortOrder: number;
  segments?: Array<{ videoUrl: string | null }>;
  badgeRequirements: Array<{
    id: string;
    summary: string | null;
    badge: CourseBadge;
  }>;
};

export type CourseDetail = {
  id: string;
  code: string | null;
  assessorCode: string | null;
  title: string;
  description: string | null;
  sectionCount: number;
  createdAt: string;
  createdBy: {
    id: string;
    name: string | null;
    email: string | null;
    externalId: string | null;
    avatarBase: string | null;
  } | null;
  settings: {
    allowCooldownOverride: boolean;
    allowAssessorMessages: boolean;
    allowCrossSectionView: boolean;
  } | null;
  contacts: CourseContact[];
  enrollments: EnrollmentSummary[];
  lessons: CourseLesson[];
};

export type CourseDetailResponse = {
  viewerRole: EnrollmentRole;
  course: CourseDetail;
};
