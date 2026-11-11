import { CourseRole, MessageAudience, MessageChannel, Prisma } from '@prisma/client';

import prisma from '@/lib/prisma';
import { EMAIL_NOT_CONFIGURED, sendEmails, type OutgoingEmail } from '@/lib/email/resend';
import { FEEDBACK_REMINDER_SUBJECT, feedbackReminderBody, feedbackReminderEmail } from '@/lib/email/templates';
import { filterToBadgeGroup } from '@/lib/messaging/badgeGroups';
import { receiptEmailFields } from '@/lib/messaging/emailDelivery';

const DAY_MS = 24 * 60 * 60 * 1000;

export type FeedbackReminderSummary = {
  coursesChecked: number;
  eligible: number;
  sent: number;
  skippedDuplicate: number;
  skippedNoEmail: number;
  skippedNotConfigured: number;
  failed: number;
};

// Reminder periods are fixed windows of intervalDays counted from the epoch, so
// every run inside one window maps to the same key and the unique constraint
// on FeedbackReminder rejects a second send.
export function reminderCycleKey(now: Date, intervalDays: number) {
  const days = Math.max(1, Math.floor(intervalDays));
  const dayIndex = Math.floor(now.getTime() / DAY_MS);
  return `${days}d:${Math.floor(dayIndex / days)}`;
}

function isUniqueViolation(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

type PendingReminder = {
  reminderId: string;
  messageId: string;
  studentId: string;
  email: OutgoingEmail;
};

// Emails (and posts an in-app message to) every student who passed a badge's
// assessment but has not finalized it, in courses that turned reminders on.
// Eligibility is recomputed from live data on each run, so a student who
// finalizes stops receiving reminders from the next run on.
export async function runFeedbackReminders(now: Date = new Date()): Promise<FeedbackReminderSummary> {
  const summary: FeedbackReminderSummary = {
    coursesChecked: 0,
    eligible: 0,
    sent: 0,
    skippedDuplicate: 0,
    skippedNoEmail: 0,
    skippedNotConfigured: 0,
    failed: 0,
  };

  const courses = await prisma.course.findMany({
    where: { settings: { feedbackRemindersEnabled: true } },
    select: {
      id: true,
      title: true,
      settings: { select: { feedbackReminderIntervalDays: true } },
      lessons: {
        select: { badgeRequirements: { select: { badge: { select: { id: true, name: true, slug: true } } } } },
      },
      enrollments: { where: { role: CourseRole.STUDENT, status: 'ACTIVE' }, select: { studentId: true } },
    },
  });

  // A badge can sit in two courses; remind once per run, not once per course.
  const remindedThisRun = new Set<string>();
  const pending: PendingReminder[] = [];

  for (const course of courses) {
    summary.coursesChecked += 1;
    const studentIds = course.enrollments.map((enrollment) => enrollment.studentId);
    if (studentIds.length === 0) continue;

    const cycleKey = reminderCycleKey(now, course.settings?.feedbackReminderIntervalDays ?? 3);
    const badges = new Map(
      course.lessons.flatMap((lesson) => lesson.badgeRequirements.map(({ badge }) => [badge.id, badge] as const))
    );

    for (const badge of badges.values()) {
      const eligibleIds = (
        await filterToBadgeGroup({ courseId: course.id, badgeId: badge.id, group: 'NEEDS_FEEDBACK_REVIEW', studentIds })
      ).filter((studentId) => !remindedThisRun.has(`${studentId}:${badge.id}`));
      if (eligibleIds.length === 0) continue;
      summary.eligible += eligibleIds.length;

      const students = await prisma.user.findMany({
        where: { id: { in: eligibleIds } },
        select: { id: true, email: true },
      });

      for (const student of students) {
        remindedThisRun.add(`${student.id}:${badge.id}`);

        // Claim the cycle first: if another run already did, the unique key
        // rejects this one and nothing is sent twice.
        let reminderId: string;
        try {
          const reminder = await prisma.feedbackReminder.create({
            data: { studentId: student.id, badgeId: badge.id, courseId: course.id, cycleKey },
            select: { id: true },
          });
          reminderId = reminder.id;
        } catch (error) {
          if (isUniqueViolation(error)) {
            summary.skippedDuplicate += 1;
            continue;
          }
          throw error;
        }

        const message = await prisma.message.create({
          data: {
            senderId: null,
            courseId: course.id,
            badgeId: badge.id,
            audience: MessageAudience.BADGE_NEEDS_FEEDBACK_REVIEW,
            channel: MessageChannel.BOTH,
            subject: FEEDBACK_REMINDER_SUBJECT,
            body: feedbackReminderBody(badge.name),
            receipts: { create: [{ userId: student.id, isObserver: false }] },
          },
          select: { id: true },
        });
        await prisma.feedbackReminder.update({ where: { id: reminderId }, data: { messageId: message.id } });

        if (!student.email) {
          summary.skippedNoEmail += 1;
          const fields = receiptEmailFields({ status: 'SKIPPED', error: 'No email address on file.' }, now);
          await recordOutcome(reminderId, message.id, student.id, fields);
          continue;
        }

        pending.push({
          reminderId,
          messageId: message.id,
          studentId: student.id,
          email: feedbackReminderEmail({
            to: student.email,
            courseTitle: course.title,
            badgeTitle: badge.name,
            badgeSlug: badge.slug,
          }),
        });
      }
    }
  }

  if (pending.length === 0) return summary;

  // One batched send for the whole run keeps well under the provider's rate limit.
  const results = await sendEmails(
    pending.map((reminder) => reminder.email),
    `reminders-${pending[0].reminderId}`
  );
  for (const [index, reminder] of pending.entries()) {
    const result = results[index];
    if (result.status === 'SENT') summary.sent += 1;
    else if (result.status === 'FAILED') summary.failed += 1;
    else if (result.error === EMAIL_NOT_CONFIGURED) summary.skippedNotConfigured += 1;
    else summary.skippedNoEmail += 1;
    await recordOutcome(reminder.reminderId, reminder.messageId, reminder.studentId, receiptEmailFields(result, now));
  }

  return summary;
}

async function recordOutcome(
  reminderId: string,
  messageId: string,
  studentId: string,
  fields: ReturnType<typeof receiptEmailFields>
) {
  await prisma.$transaction([
    prisma.feedbackReminder.update({
      where: { id: reminderId },
      data: { emailStatus: fields.emailStatus, emailError: fields.emailError },
    }),
    prisma.messageReceipt.update({
      where: { messageId_userId: { messageId, userId: studentId } },
      data: fields,
    }),
  ]);
}
