/** @jest-environment node */

import { Prisma } from '@prisma/client';

import { reminderCycleKey, runFeedbackReminders } from '../lib/reminders/feedbackReminders';
import { filterToBadgeGroup } from '../lib/messaging/badgeGroups';
import { sendEmails } from '../lib/email/resend';
import prisma from '../lib/prisma';

jest.mock('../lib/email/resend', () => ({ sendEmails: jest.fn() }));
jest.mock('../lib/messaging/badgeGroups', () => ({ filterToBadgeGroup: jest.fn() }));

jest.mock('../lib/prisma', () => ({
  __esModule: true,
  default: {
    course: { findMany: jest.fn() },
    user: { findMany: jest.fn() },
    feedbackReminder: { create: jest.fn(), update: jest.fn((args: unknown) => args) },
    message: { create: jest.fn() },
    messageReceipt: { update: jest.fn((args: unknown) => args) },
    $transaction: jest.fn((ops: unknown[]) => Promise.resolve(ops)),
  },
}));

const mockSendEmails = sendEmails as jest.MockedFunction<typeof sendEmails>;
const mockFilter = filterToBadgeGroup as jest.MockedFunction<typeof filterToBadgeGroup>;
const mockPrisma = prisma as unknown as {
  course: { findMany: jest.Mock };
  user: { findMany: jest.Mock };
  feedbackReminder: { create: jest.Mock; update: jest.Mock };
  message: { create: jest.Mock };
  messageReceipt: { update: jest.Mock };
};

const NOW = new Date('2026-11-06T14:00:00.000Z');
const titration = { id: 'b1', name: 'Titration', slug: 'titration' };

function course(id: string, badges = [titration], students = ['s1', 's2']) {
  return {
    id,
    title: `Course ${id}`,
    settings: { feedbackReminderIntervalDays: 3 },
    lessons: [{ badgeRequirements: badges.map((badge) => ({ badge })) }],
    enrollments: students.map((studentId) => ({ studentId })),
  };
}

function uniqueViolation() {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' });
}

beforeEach(() => {
  jest.clearAllMocks();
  let reminderCount = 0;
  mockPrisma.feedbackReminder.create.mockImplementation(() => Promise.resolve({ id: `r${++reminderCount}` }));
  let messageCount = 0;
  mockPrisma.message.create.mockImplementation(() => Promise.resolve({ id: `m${++messageCount}` }));
  mockPrisma.user.findMany.mockImplementation((args: { where: { id: { in: string[] } } }) =>
    Promise.resolve(args.where.id.in.map((id) => ({ id, email: `${id}@bu.edu` })))
  );
  mockSendEmails.mockImplementation((emails) => Promise.resolve(emails.map(() => ({ status: 'SENT', id: 'e' }))));
});

describe('reminderCycleKey', () => {
  it('is stable within a cycle and changes after it', () => {
    const key = reminderCycleKey(NOW, 3);
    expect(reminderCycleKey(new Date(NOW.getTime() + 60 * 60 * 1000), 3)).toBe(key);
    expect(reminderCycleKey(new Date(NOW.getTime() + 3 * 24 * 60 * 60 * 1000), 3)).not.toBe(key);
  });
});

describe('runFeedbackReminders', () => {
  it('only queries courses that turned reminders on', async () => {
    mockPrisma.course.findMany.mockResolvedValue([]);

    const summary = await runFeedbackReminders(NOW);

    expect(mockPrisma.course.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { settings: { feedbackRemindersEnabled: true } } })
    );
    expect(summary.coursesChecked).toBe(0);
    expect(mockSendEmails).not.toHaveBeenCalled();
  });

  it('reminds only students currently awaiting feedback review', async () => {
    mockPrisma.course.findMany.mockResolvedValue([course('c1')]);
    // s2 already finalized, so the live group check leaves only s1.
    mockFilter.mockResolvedValue(['s1']);

    const summary = await runFeedbackReminders(NOW);

    expect(mockFilter).toHaveBeenCalledWith({
      courseId: 'c1',
      badgeId: 'b1',
      group: 'NEEDS_FEEDBACK_REVIEW',
      studentIds: ['s1', 's2'],
    });
    expect(mockPrisma.feedbackReminder.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.feedbackReminder.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { studentId: 's1', badgeId: 'b1', courseId: 'c1', cycleKey: reminderCycleKey(NOW, 3) },
      })
    );
    expect(mockPrisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          senderId: null,
          audience: 'BADGE_NEEDS_FEEDBACK_REVIEW',
          channel: 'BOTH',
          receipts: { create: [{ userId: 's1', isObserver: false }] },
        }),
      })
    );
    const [emails] = mockSendEmails.mock.calls[0];
    expect(emails).toHaveLength(1);
    expect(emails[0].to).toBe('s1@bu.edu');
    expect(emails[0].text).toContain('/badges/titration/feedback');
    expect(summary).toMatchObject({ coursesChecked: 1, eligible: 1, sent: 1, failed: 0 });
  });

  it('skips a student already reminded this cycle', async () => {
    mockPrisma.course.findMany.mockResolvedValue([course('c1')]);
    mockFilter.mockResolvedValue(['s1', 's2']);
    mockPrisma.feedbackReminder.create.mockRejectedValueOnce(uniqueViolation()).mockResolvedValueOnce({ id: 'r2' });

    const summary = await runFeedbackReminders(NOW);

    expect(summary).toMatchObject({ eligible: 2, skippedDuplicate: 1, sent: 1 });
    expect(mockPrisma.message.create).toHaveBeenCalledTimes(1);
    expect(mockSendEmails.mock.calls[0][0]).toHaveLength(1);
  });

  it('reminds once when the same badge is in two courses', async () => {
    mockPrisma.course.findMany.mockResolvedValue([course('c1'), course('c2')]);
    mockFilter.mockResolvedValue(['s1']);

    const summary = await runFeedbackReminders(NOW);

    expect(mockPrisma.feedbackReminder.create).toHaveBeenCalledTimes(1);
    expect(summary.sent).toBe(1);
  });

  it('records failed sends on the reminder and receipt', async () => {
    mockPrisma.course.findMany.mockResolvedValue([course('c1')]);
    mockFilter.mockResolvedValue(['s1']);
    mockSendEmails.mockResolvedValue([{ status: 'FAILED', error: 'Rate limited' }]);

    const summary = await runFeedbackReminders(NOW);

    expect(summary).toMatchObject({ sent: 0, failed: 1 });
    expect(mockPrisma.feedbackReminder.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: { emailStatus: 'FAILED', emailError: 'Rate limited' },
    });
    expect(mockPrisma.messageReceipt.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ emailStatus: 'FAILED' }) })
    );
  });

  it('posts the in-app reminder even without an email address', async () => {
    mockPrisma.course.findMany.mockResolvedValue([course('c1')]);
    mockFilter.mockResolvedValue(['s1']);
    mockPrisma.user.findMany.mockResolvedValue([{ id: 's1', email: null }]);

    const summary = await runFeedbackReminders(NOW);

    expect(mockPrisma.message.create).toHaveBeenCalledTimes(1);
    expect(mockSendEmails).not.toHaveBeenCalled();
    expect(summary.skippedNoEmail).toBe(1);
  });
});
