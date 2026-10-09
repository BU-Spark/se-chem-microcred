import { NextRequest, NextResponse } from 'next/server';

import { ensureCurrentUser } from '@/app/api/courses/lib/ensure-user';
import prisma from '@/lib/prisma';
import { canEditBadgeResources, resolveFamilyRootId } from '@/lib/badges/badge-resources';

type RouteContext = { params: Promise<{ badgeId: string; resourceId: string }> };

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const user = await ensureCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { badgeId, resourceId } = await context.params;
    if (!badgeId || !resourceId || !(await canEditBadgeResources(user.id, badgeId))) {
      return NextResponse.json({ error: 'Badge not found or you are not its creator.' }, { status: 404 });
    }
    const rootId = await resolveFamilyRootId(badgeId);

    // Scope the delete to this family so a resource id from another badge 404s.
    const { count } = await prisma.badgeResource.deleteMany({ where: { id: resourceId, badgeId: rootId ?? '' } });
    if (count === 0) {
      return NextResponse.json({ error: 'Resource not found.' }, { status: 404 });
    }
    return NextResponse.json({ deleted: resourceId });
  } catch (error) {
    console.error('DELETE /api/badges/[badgeId]/resources/[resourceId] failed:', error);
    return NextResponse.json({ error: 'Failed to delete resource.' }, { status: 500 });
  }
}
