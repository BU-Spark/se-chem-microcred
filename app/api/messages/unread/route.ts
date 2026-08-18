import { NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';

import prisma from '@/lib/prisma';

// GET: how many messages the signed-in user has not opened, across every course
// they are in. Staff copies of a blast count like any other unread mail. Kept
// separate from the inbox route so the sidebar can ask for a number without
// pulling a hundred message bodies on every page load.
export async function GET() {
  try {
    const clerkUser = await currentUser();
    const email = clerkUser?.emailAddresses?.[0]?.emailAddress?.trim().toLowerCase();
    if (!email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (!user) {
      return NextResponse.json({ count: 0 }, { status: 200 });
    }

    const count = await prisma.messageReceipt.count({
      where: { userId: user.id, readAt: null },
    });

    return NextResponse.json({ count }, { status: 200 });
  } catch (error) {
    console.error('GET /api/messages/unread failed:', error);
    return NextResponse.json({ error: 'Failed to load unread count.' }, { status: 500 });
  }
}
