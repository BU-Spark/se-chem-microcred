/** @jest-environment node */

import { currentUser } from '@clerk/nextjs/server';

import { POST } from '../app/api/messages/route';
import prisma from '../lib/prisma';
import { sendEmails } from '../lib/email/resend';

jest.mock('@clerk/nextjs/server', () => ({
  currentUser: jest.fn(),
}));

jest.mock('../lib/email/resend', () => ({
  EMAIL_NOT_CONFIGURED: 'Email is not configured.',
  sendEmails: jest.fn(),
}));

jest.mock('../lib/prisma', () => ({
  __esModule: true,
  default: {
    user: { findUnique: jest.fn(), findMany: jest.fn() },
    course: { findFirst: jest.fn() },
    enrollment: { findMany: jest.fn() },
    message: { create: jest.fn() },
    messageReceipt: { update: jest.fn((args: unknown) => args) },
    studentBadge: { findMany: jest.fn() },
    $transaction: jest.fn((ops: unknown[]) => Promise.resolve(ops)),
  },
}));

const mockCurrentUser = currentUser as jest.MockedFunction<typeof currentUser>;
const mockSendEmails = sendEmails as jest.MockedFunction<typeof sendEmails>;
const mockPrisma = prisma as unknown as {
  user: { findUnique: jest.Mock; findMany: jest.Mock };
  course: { findFirst: jest.Mock };
  enrollment: { findMany: jest.Mock };
  message: { create: jest.Mock };
  messageReceipt: { update: jest.Mock };
  $transaction: jest.Mock;
};

function postRequest(body: unknown) {
  return new Request('http://localhost/api/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function receiptUpdateFor(userId: string) {
  const call = mockPrisma.messageReceipt.update.mock.calls.find(
    ([args]) => args.where.messageId_userId.userId === userId
  );
  return call?.[0].data;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCurrentUser.mockResolvedValue({
    emailAddresses: [{ emailAddress: 'prof@bu.edu' }],
  } as Awaited<ReturnType<typeof currentUser>>);
  mockPrisma.user.findUnique.mockResolvedValue({ id: 'sender-1', name: 'Prof Smith' });
  mockPrisma.course.findFirst.mockResolvedValue({
    title: 'Chem 101',
    createdById: 'sender-1',
    settings: { allowCheckerMessages: false, allowCrossSectionView: false },
    enrollments: [],
  });
  // Students for the recipient query; staff for the observer copies.
  mockPrisma.enrollment.findMany.mockImplementation((args: { where?: { role?: unknown } }) => {
    const role = args?.where?.role as { in?: string[] } | undefined;
    if (role && typeof role === 'object' && Array.isArray(role.in)) {
      return Promise.resolve([{ studentId: 'checker-1' }]);
    }
    return Promise.resolve([
      { studentId: 's1', sections: [] },
      { studentId: 's2', sections: [] },
    ]);
  });
  mockPrisma.message.create.mockResolvedValue({ id: 'm1' });
  mockPrisma.user.findMany.mockResolvedValue([
    { id: 's1', email: 's1@bu.edu' },
    { id: 's2', email: 's2@bu.edu' },
  ]);
});

describe('POST /api/messages delivery channel', () => {
  it('defaults to in-app and sends no email', async () => {
    const response = await POST(postRequest({ courseId: 'course-1', allStudents: true, body: 'Hi' }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toEqual({ sent: 2, emailed: 0, emailFailed: 0, emailSkipped: 0, emailNotConfigured: 0 });
    expect(mockPrisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ channel: 'IN_APP' }) })
    );
    expect(mockSendEmails).not.toHaveBeenCalled();
  });

  it('rejects an unknown channel', async () => {
    const response = await POST(
      postRequest({ courseId: 'course-1', allStudents: true, body: 'Hi', channel: 'CARRIER_PIGEON' })
    );
    expect(response.status).toBe(400);
    expect(mockPrisma.message.create).not.toHaveBeenCalled();
  });

  it('emails the students only, never the staff observers', async () => {
    mockSendEmails.mockResolvedValue([
      { status: 'SENT', id: 'e1' },
      { status: 'SENT', id: 'e2' },
    ]);

    const response = await POST(
      postRequest({ courseId: 'course-1', allStudents: true, subject: 'Lab', body: 'Bring goggles.', channel: 'BOTH' })
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toEqual({ sent: 2, emailed: 2, emailFailed: 0, emailSkipped: 0, emailNotConfigured: 0 });
    expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ['s1', 's2'] } } })
    );
    const [emails, prefix] = mockSendEmails.mock.calls[0];
    expect(emails.map((email) => email.to)).toEqual(['s1@bu.edu', 's2@bu.edu']);
    expect(emails[0].subject).toBe('[Chem 101] Lab');
    expect(emails[0].text).toContain('Bring goggles.');
    expect(prefix).toBe('msg-m1');
    expect(receiptUpdateFor('s1')).toMatchObject({ emailStatus: 'SENT', emailId: 'e1' });
    expect(receiptUpdateFor('checker-1')).toBeUndefined();
  });

  it('keeps the send and reports failures when an email is rejected', async () => {
    mockSendEmails.mockResolvedValue([
      { status: 'SENT', id: 'e1' },
      { status: 'FAILED', error: 'Invalid address' },
    ]);

    const response = await POST(postRequest({ courseId: 'course-1', allStudents: true, body: 'Hi', channel: 'EMAIL' }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toMatchObject({ sent: 2, emailed: 1, emailFailed: 1 });
    expect(mockPrisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ channel: 'EMAIL' }) })
    );
    expect(receiptUpdateFor('s2')).toMatchObject({ emailStatus: 'FAILED', emailError: 'Invalid address' });
  });

  it('records students without an email address as skipped', async () => {
    mockPrisma.user.findMany.mockResolvedValue([
      { id: 's1', email: 's1@bu.edu' },
      { id: 's2', email: null },
    ]);
    mockSendEmails.mockResolvedValue([{ status: 'SENT', id: 'e1' }]);

    const response = await POST(postRequest({ courseId: 'course-1', allStudents: true, body: 'Hi', channel: 'EMAIL' }));
    const body = await response.json();

    expect(body).toMatchObject({ emailed: 1, emailSkipped: 1 });
    expect(mockSendEmails.mock.calls[0][0]).toHaveLength(1);
    expect(receiptUpdateFor('s2')).toMatchObject({ emailStatus: 'SKIPPED' });
  });

  it('reports emails held back by missing config apart from missing addresses', async () => {
    mockSendEmails.mockResolvedValue([
      { status: 'SKIPPED', error: 'Email is not configured.' },
      { status: 'SKIPPED', error: 'Email is not configured.' },
    ]);

    const response = await POST(postRequest({ courseId: 'course-1', allStudents: true, body: 'Hi', channel: 'EMAIL' }));
    const body = await response.json();

    expect(body).toMatchObject({ emailed: 0, emailSkipped: 0, emailNotConfigured: 2 });
  });

  it('still returns 201 if recording the email outcome throws', async () => {
    mockSendEmails.mockResolvedValue([
      { status: 'SENT', id: 'e1' },
      { status: 'SENT', id: 'e2' },
    ]);
    mockPrisma.$transaction.mockRejectedValueOnce(new Error('db down'));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const response = await POST(postRequest({ courseId: 'course-1', allStudents: true, body: 'Hi', channel: 'BOTH' }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toMatchObject({ sent: 2, emailFailed: 2 });
    spy.mockRestore();
  });
});
