import { NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';

import prisma from '@/lib/prisma';

// PATCH: mark one of the signed-in user's received messages as read. Only a
// user holding a receipt for it may mark it, and only their own copy is
// touched; already-read messages are a no-op.
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

    // The id is the message's; read state is the caller's own receipt. No
    // receipt means this message never reached them, which reads as not found.
    const receipt = await prisma.messageReceipt.findUnique({
      where: { messageId_userId: { messageId: id, userId: recipient.id } },
      select: { id: true, readAt: true },
    });
    if (!receipt) {
      return NextResponse.json({ error: 'Message not found.' }, { status: 404 });
    }

    const readAt = receipt.readAt ?? new Date();
    if (!receipt.readAt) {
      await prisma.messageReceipt.update({ where: { id: receipt.id }, data: { readAt } });
    }

    return NextResponse.json({ id, read: true, readAt: readAt.toISOString() }, { status: 200 });
  } catch (error) {
    console.error('PATCH /api/messages/[id] failed:', error);
    return NextResponse.json({ error: 'Failed to update message.' }, { status: 500 });
  }
}
