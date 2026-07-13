import { NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';

import prisma from '@/lib/prisma';

// PATCH: mark one of the signed-in user's received messages as read. Only the
// recipient may mark their own message; already-read messages are a no-op.
export async function PATCH(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const clerkUser = await currentUser();
    const email = clerkUser?.emailAddresses?.[0]?.emailAddress?.trim().toLowerCase();
    if (!email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const recipient = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (!recipient) {
      return NextResponse.json({ error: 'User record not found.' }, { status: 404 });
    }

    const message = await prisma.message.findUnique({
      where: { id },
      select: { id: true, recipientId: true, readAt: true },
    });
    if (!message || message.recipientId !== recipient.id) {
      return NextResponse.json({ error: 'Message not found.' }, { status: 404 });
    }

    const readAt = message.readAt ?? new Date();
    if (!message.readAt) {
      await prisma.message.update({ where: { id }, data: { readAt } });
    }

    return NextResponse.json({ id: message.id, read: true, readAt: readAt.toISOString() }, { status: 200 });
  } catch (error) {
    console.error('PATCH /api/messages/[id] failed:', error);
    return NextResponse.json({ error: 'Failed to update message.' }, { status: 500 });
  }
}
