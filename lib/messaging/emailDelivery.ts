import { EmailStatus, MessageChannel } from '@prisma/client';

import prisma from '@/lib/prisma';
import { EMAIL_NOT_CONFIGURED, sendEmails, type EmailResult } from '@/lib/email/resend';
import { instructorMessageEmail } from '@/lib/email/templates';

export const MESSAGE_CHANNELS = [MessageChannel.IN_APP, MessageChannel.EMAIL, MessageChannel.BOTH] as const;

export function isMessageChannel(value: unknown): value is MessageChannel {
  return typeof value === 'string' && (MESSAGE_CHANNELS as readonly string[]).includes(value);
}

export function channelIncludesEmail(channel: MessageChannel) {
  return channel === MessageChannel.EMAIL || channel === MessageChannel.BOTH;
}

// Received lists and unread counts skip email-only messages: the receipt is
// kept as the audience/delivery record, but the student got it by email.
export const IN_APP_CHANNELS = { in: [MessageChannel.IN_APP, MessageChannel.BOTH] };

// emailSkipped is students with no address on file; emailNotConfigured is
// emails held back because the server has no Resend key/sender.
export type EmailDeliverySummary = {
  emailed: number;
  emailFailed: number;
  emailSkipped: number;
  emailNotConfigured: number;
};

export const NO_EMAIL_DELIVERY: EmailDeliverySummary = {
  emailed: 0,
  emailFailed: 0,
  emailSkipped: 0,
  emailNotConfigured: 0,
};

export function receiptEmailFields(result: EmailResult, now: Date) {
  switch (result.status) {
    case 'SENT':
      return { emailStatus: EmailStatus.SENT, emailId: result.id, emailError: null, emailedAt: now };
    case 'FAILED':
      return { emailStatus: EmailStatus.FAILED, emailId: null, emailError: result.error, emailedAt: null };
    case 'SKIPPED':
      return { emailStatus: EmailStatus.SKIPPED, emailId: null, emailError: result.error, emailedAt: null };
  }
}

// Emails an already-saved message to its student recipients (never staff
// observers) and records the outcome on each receipt. Runs after the message
// is committed, so a provider outage leaves the in-app message intact and the
// failures visible in the Sent list.
export async function emailMessageToStudents(options: {
  messageId: string;
  studentIds: string[];
  courseTitle: string;
  senderName: string | null;
  subject: string;
  body: string;
}): Promise<EmailDeliverySummary> {
  const { messageId, studentIds } = options;
  const students = await prisma.user.findMany({
    where: { id: { in: studentIds } },
    select: { id: true, email: true },
  });

  const reachable = students.filter((student): student is { id: string; email: string } => Boolean(student.email));
  const results = await sendEmails(
    reachable.map((student) =>
      instructorMessageEmail({
        to: student.email,
        courseTitle: options.courseTitle,
        senderName: options.senderName,
        subject: options.subject,
        body: options.body,
      })
    ),
    `msg-${messageId}`
  );

  const outcomes = new Map<string, EmailResult>();
  reachable.forEach((student, index) => outcomes.set(student.id, results[index]));
  for (const id of studentIds) {
    if (!outcomes.has(id)) outcomes.set(id, { status: 'SKIPPED', error: 'No email address on file.' });
  }

  const now = new Date();
  await prisma.$transaction(
    [...outcomes].map(([userId, result]) =>
      prisma.messageReceipt.update({
        where: { messageId_userId: { messageId, userId } },
        data: receiptEmailFields(result, now),
      })
    )
  );

  const summary: EmailDeliverySummary = { ...NO_EMAIL_DELIVERY };
  for (const result of outcomes.values()) {
    if (result.status === 'SENT') summary.emailed += 1;
    else if (result.status === 'FAILED') summary.emailFailed += 1;
    else if (result.error === EMAIL_NOT_CONFIGURED) summary.emailNotConfigured += 1;
    else summary.emailSkipped += 1;
  }
  return summary;
}
