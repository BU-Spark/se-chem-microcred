import { NextRequest, NextResponse } from 'next/server';

import { ensureCurrentUser } from '@/app/api/courses/lib/ensure-user';
import prisma from '@/lib/prisma';
import { canViewBadgeResources } from '@/lib/badges/badge-resources';

type RouteContext = { params: Promise<{ resourceId: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const user = await ensureCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { resourceId } = await context.params;
    const resource = resourceId
      ? await prisma.badgeResource.findUnique({ where: { id: resourceId }, select: { badgeId: true, kind: true } })
      : null;
    if (!resource || resource.kind !== 'FILE') {
      return NextResponse.json({ error: 'File not found.' }, { status: 404 });
    }

    if (!(await canViewBadgeResources(user.id, resource.badgeId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const file = await prisma.badgeResourceFile.findUnique({
      where: { resourceId },
      select: { fileName: true, sizeBytes: true, data: true },
    });
    if (!file) return NextResponse.json({ error: 'File not found.' }, { status: 404 });

    return new NextResponse(Buffer.from(file.data), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': String(file.data.byteLength),
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, max-age=0, must-revalidate',
      },
    });
  } catch (error) {
    console.error('GET /api/badge-resources/[resourceId]/file failed:', error);
    return NextResponse.json({ error: 'Failed to load file.' }, { status: 500 });
  }
}
