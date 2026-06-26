import { NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';

import prisma from '@/lib/prisma';

// GET: the signed-in user's received messages, newest first.
export async function GET() {
  try {
    const clerkUser = await currentUser();
    const email = clerkUser?.emailAddresses?.[0]?.emailAddress?.trim().toLowerCase();
    if (!email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const recipient = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (!recipient) {
      return NextResponse.json({ count: 0, messages: [] }, { status: 200 });
    }

    const messages = await prisma.message.findMany({
      where: { recipientId: recipient.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        subject: true,
        body: true,
        readAt: true,
        createdAt: true,
        sender: { select: { name: true, email: true } },
        course: { select: { title: true } },
        badge: { select: { name: true } },
      },
    });

    return NextResponse.json(
      {
        count: messages.length,
        messages: messages.map((message) => ({
          id: message.id,
          subject: message.subject,
          body: message.body,
          read: message.readAt != null,
          createdAt: message.createdAt.toISOString(),
          senderName: message.sender?.name ?? null,
          courseTitle: message.course?.title ?? null,
          badgeName: message.badge?.name ?? null,
        })),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('GET /api/messages failed:', error);
    return NextResponse.json({ error: 'Failed to load messages.' }, { status: 500 });
  }
}
