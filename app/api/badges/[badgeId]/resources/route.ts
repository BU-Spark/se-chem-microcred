import { NextRequest, NextResponse } from 'next/server';

import { ensureCurrentUser } from '@/app/api/courses/lib/ensure-user';
import prisma from '@/lib/prisma';
import {
  BadgeResourceValidationError,
  MAX_FAMILY_FILE_BYTES,
  MAX_PDF_BYTES,
  MAX_RESOURCES_PER_BADGE,
  RESOURCE_METADATA_SELECT,
  canEditBadgeResources,
  canViewBadgeResources,
  normalizeResourceLink,
  normalizeResourceTitle,
  resolveFamilyRootId,
  sanitizePdfFileName,
  toResourceDto,
  validatePdf,
} from '@/lib/badges/badge-resources';

type RouteContext = { params: Promise<{ badgeId: string }> };

// Multipart overhead (boundary, headers, title field) on top of the PDF itself.
const MAX_MULTIPART_BYTES = MAX_PDF_BYTES + 64 * 1024;

async function listResources(rootId: string) {
  const rows = await prisma.badgeResource.findMany({
    where: { badgeId: rootId },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: RESOURCE_METADATA_SELECT,
  });
  return rows.map(toResourceDto);
}

function validationResponse(error: unknown) {
  if (error instanceof BadgeResourceValidationError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return null;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const user = await ensureCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { badgeId } = await context.params;
    const rootId = badgeId ? await resolveFamilyRootId(badgeId) : null;
    if (!rootId) return NextResponse.json({ error: 'Badge not found.' }, { status: 404 });

    if (!(await canViewBadgeResources(user.id, rootId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json({ resources: await listResources(rootId) });
  } catch (error) {
    console.error('GET /api/badges/[badgeId]/resources failed:', error);
    return NextResponse.json({ error: 'Failed to load resources.' }, { status: 500 });
  }
}

// JSON body { kind: 'LINK', title, url } adds a link; multipart/form-data with
// `file` (+ optional `title`) adds a PDF.
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await ensureCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { badgeId } = await context.params;
    if (!badgeId || !(await canEditBadgeResources(user.id, badgeId))) {
      return NextResponse.json({ error: 'Badge not found or you are not its creator.' }, { status: 404 });
    }
    const rootId = await resolveFamilyRootId(badgeId);
    if (!rootId) return NextResponse.json({ error: 'Badge not found.' }, { status: 404 });

    const existing = await prisma.badgeResource.findMany({
      where: { badgeId: rootId },
      select: { sortOrder: true, file: { select: { sizeBytes: true } } },
    });
    if (existing.length >= MAX_RESOURCES_PER_BADGE) {
      return NextResponse.json(
        { error: `A badge can have at most ${MAX_RESOURCES_PER_BADGE} resources.` },
        { status: 400 }
      );
    }
    const nextSortOrder = existing.reduce((max, row) => Math.max(max, row.sortOrder + 1), 0);

    const contentType = request.headers.get('content-type') ?? '';

    if (contentType.startsWith('multipart/form-data')) {
      // Reject oversized uploads before buffering the whole body.
      const declaredLength = Number(request.headers.get('content-length') ?? 0);
      if (declaredLength > MAX_MULTIPART_BYTES) {
        return NextResponse.json({ error: 'PDFs can be at most 3 MB.' }, { status: 413 });
      }

      const form = await request.formData();
      const file = form.get('file');
      if (!(file instanceof Blob)) {
        return NextResponse.json({ error: 'Attach a PDF file.' }, { status: 400 });
      }
      if (file.size > MAX_PDF_BYTES) {
        return NextResponse.json({ error: 'PDFs can be at most 3 MB.' }, { status: 413 });
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      validatePdf(bytes);

      const usedBytes = existing.reduce((sum, row) => sum + (row.file?.sizeBytes ?? 0), 0);
      if (usedBytes + bytes.byteLength > MAX_FAMILY_FILE_BYTES) {
        return NextResponse.json({ error: 'This badge has reached its 25 MB file limit.' }, { status: 400 });
      }

      const fileName = sanitizePdfFileName('name' in file ? (file as File).name : '');
      const title = normalizeResourceTitle(form.get('title'), fileName.replace(/\.pdf$/i, ''));

      const created = await prisma.badgeResource.create({
        data: {
          badgeId: rootId,
          kind: 'FILE',
          title,
          sortOrder: nextSortOrder,
          createdById: user.id,
          file: {
            create: { fileName, mimeType: 'application/pdf', sizeBytes: bytes.byteLength, data: Buffer.from(bytes) },
          },
        },
        select: RESOURCE_METADATA_SELECT,
      });
      return NextResponse.json({ resource: toResourceDto(created) }, { status: 201 });
    }

    const body = (await request.json().catch(() => null)) as { kind?: unknown; title?: unknown; url?: unknown } | null;
    if (!body || body.kind !== 'LINK') {
      return NextResponse.json({ error: 'Send a link as JSON or a PDF as form data.' }, { status: 400 });
    }
    const { url, hostname } = normalizeResourceLink(body.url);
    const title = normalizeResourceTitle(body.title, hostname);

    const created = await prisma.badgeResource.create({
      data: { badgeId: rootId, kind: 'LINK', title, url, sortOrder: nextSortOrder, createdById: user.id },
      select: RESOURCE_METADATA_SELECT,
    });
    return NextResponse.json({ resource: toResourceDto(created) }, { status: 201 });
  } catch (error) {
    const invalid = validationResponse(error);
    if (invalid) return invalid;
    console.error('POST /api/badges/[badgeId]/resources failed:', error);
    return NextResponse.json({ error: 'Failed to add resource.' }, { status: 500 });
  }
}

// Reorder and/or rename: body { resources: [{ id, title?, sortOrder }] }. Every id
// must belong to this badge's family.
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const user = await ensureCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { badgeId } = await context.params;
    if (!badgeId || !(await canEditBadgeResources(user.id, badgeId))) {
      return NextResponse.json({ error: 'Badge not found or you are not its creator.' }, { status: 404 });
    }
    const rootId = await resolveFamilyRootId(badgeId);
    if (!rootId) return NextResponse.json({ error: 'Badge not found.' }, { status: 404 });

    const body = (await request.json().catch(() => null)) as { resources?: unknown } | null;
    if (!body || !Array.isArray(body.resources)) {
      return NextResponse.json({ error: 'resources must be an array.' }, { status: 400 });
    }

    const updates = body.resources.map((entry) => {
      const item = (entry ?? {}) as { id?: unknown; title?: unknown; sortOrder?: unknown };
      if (typeof item.id !== 'string' || !Number.isInteger(item.sortOrder)) {
        throw new BadgeResourceValidationError('Each resource needs an id and an integer sortOrder.');
      }
      return {
        id: item.id,
        sortOrder: item.sortOrder as number,
        title: item.title === undefined ? undefined : normalizeResourceTitle(item.title, ''),
      };
    });
    if (updates.some((update) => update.title === '')) {
      throw new BadgeResourceValidationError('Titles cannot be empty.');
    }

    const ids = new Set(updates.map((update) => update.id));
    const owned = await prisma.badgeResource.count({ where: { id: { in: [...ids] }, badgeId: rootId } });
    if (owned !== ids.size) {
      return NextResponse.json({ error: 'One or more resources do not belong to this badge.' }, { status: 400 });
    }

    await prisma.$transaction(
      updates.map((update) =>
        prisma.badgeResource.update({
          where: { id: update.id },
          data: { sortOrder: update.sortOrder, ...(update.title ? { title: update.title } : {}) },
        })
      )
    );

    return NextResponse.json({ resources: await listResources(rootId) });
  } catch (error) {
    const invalid = validationResponse(error);
    if (invalid) return invalid;
    console.error('PATCH /api/badges/[badgeId]/resources failed:', error);
    return NextResponse.json({ error: 'Failed to update resources.' }, { status: 500 });
  }
}
