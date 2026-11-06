import { NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';

import prisma from '@/lib/prisma';
import { IN_APP_CHANNELS } from '@/lib/messaging/emailDelivery';

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
      where: { userId: user.id, readAt: null, message: { channel: IN_APP_CHANNELS } },
    });

    return NextResponse.json({ count }, { status: 200 });
  } catch (error) {
    console.error('GET /api/messages/unread failed:', error);
    return NextResponse.json({ error: 'Failed to load unread count.' }, { status: 500 });
  }
}
