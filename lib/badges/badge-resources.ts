import { BadgeResourceKind } from '@prisma/client';

import prisma from '@/lib/prisma';
import { isLessonReleased } from '@/lib/lessonVisibility';
import { isStaff } from '@/lib/roles';

export {
  BadgeResourceValidationError,
  MAX_FAMILY_FILE_BYTES,
  MAX_LINK_LENGTH,
  MAX_PDF_BYTES,
  MAX_RESOURCES_PER_BADGE,
  MAX_RESOURCE_TITLE_LENGTH,
  normalizeResourceLink,
  normalizeResourceTitle,
  sanitizePdfFileName,
  validatePdf,
} from './badge-resource-rules';

// Metadata only: never select the file bytes in list queries.
export const RESOURCE_METADATA_SELECT = {
  id: true,
  kind: true,
  title: true,
  url: true,
  sortOrder: true,
  file: { select: { fileName: true, sizeBytes: true } },
} as const;

export type BadgeResourceDto = {
  id: string;
  kind: BadgeResourceKind;
  title: string;
  url: string | null;
  sortOrder: number;
  fileName: string | null;
  sizeBytes: number | null;
};

export function toResourceDto(row: {
  id: string;
  kind: BadgeResourceKind;
  title: string;
  url: string | null;
  sortOrder: number;
  file: { fileName: string; sizeBytes: number } | null;
}): BadgeResourceDto {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    url: row.url,
    sortOrder: row.sortOrder,
    fileName: row.file?.fileName ?? null,
    sizeBytes: row.file?.sizeBytes ?? null,
  };
}

// Returns the family root id for a badge, or null when the badge does not exist.
export async function resolveFamilyRootId(badgeId: string): Promise<string | null> {
  const badge = await prisma.badge.findUnique({ where: { id: badgeId }, select: { id: true, sourceBadgeId: true } });
  if (!badge) return null;
  return badge.sourceBadgeId ?? badge.id;
}

// Editing follows executeBadgePatchTx: the editor must own the badge they are
// editing; the change then applies to the whole family via the root.
export async function canEditBadgeResources(userId: string, badgeId: string): Promise<boolean> {
  const badge = await prisma.badge.findFirst({ where: { id: badgeId, createdById: userId }, select: { id: true } });
  return Boolean(badge);
}

export async function canViewBadgeResources(userId: string, rootBadgeId: string, now = new Date()): Promise<boolean> {
  const family = await prisma.badge.findMany({
    where: { OR: [{ id: rootBadgeId }, { sourceBadgeId: rootBadgeId }] },
    select: { id: true, createdById: true },
  });
  if (family.length === 0) return false;
  if (family.some((badge) => badge.createdById === userId)) return true;

  const requirements = await prisma.badgeRequirement.findMany({
    where: {
      badgeId: { in: family.map((badge) => badge.id) },
      lesson: {
        course: {
          OR: [{ createdById: userId }, { enrollments: { some: { studentId: userId, status: 'ACTIVE' } } }],
        },
      },
    },
    select: {
      badge: { select: { availableOn: true } },
      lesson: {
        select: {
          course: {
            select: {
              createdById: true,
              enrollments: { where: { studentId: userId, status: 'ACTIVE' }, select: { role: true } },
            },
          },
        },
      },
    },
  });

  return requirements.some((requirement) => {
    const course = requirement.lesson?.course;
    if (!course) return false;
    if (course.createdById === userId) return true;
    const role = course.enrollments[0]?.role;
    if (isStaff(role)) return true;
    return role === 'STUDENT' && isLessonReleased(requirement.badge.availableOn, now);
  });
}
