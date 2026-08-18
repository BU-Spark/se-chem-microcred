/** @jest-environment node */

import { NextRequest } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';

import { GET, POST } from '../app/api/messages/route';
import { PATCH } from '../app/api/messages/[id]/route';
import { POST as reminderPOST } from '../app/api/courses/[courseId]/badges/[badgeId]/reminders/route';
import prisma from '../lib/prisma';

jest.mock('@clerk/nextjs/server', () => ({
  currentUser: jest.fn(),
}));

jest.mock('../lib/prisma', () => ({
  __esModule: true,
  default: {
    user: { findUnique: jest.fn() },
    course: { findFirst: jest.fn() },
    enrollment: { findMany: jest.fn() },
    message: { create: jest.fn() },
    messageReceipt: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    studentBadge: { findMany: jest.fn() },
  },
}));

const mockCurrentUser = currentUser as jest.MockedFunction<typeof currentUser>;
const mockPrisma = prisma as unknown as {
  user: { findUnique: jest.Mock };
  course: { findFirst: jest.Mock };
  enrollment: { findMany: jest.Mock };
  message: { create: jest.Mock };
  messageReceipt: { findMany: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
  studentBadge: { findMany: jest.Mock };
};

function signedInAs(email: string | null) {
  mockCurrentUser.mockResolvedValue(
    email ? ({ emailAddresses: [{ emailAddress: email }] } as Awaited<ReturnType<typeof currentUser>>) : null
  );
}

function postRequest(body: unknown) {
  return new Request('http://localhost/api/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function receiptRow(overrides: { readAt?: Date | null; message?: Record<string, unknown> } = {}) {
  return {
    readAt: overrides.readAt ?? null,
    message: {
      id: 'm1',
      subject: 'Hello',
      body: 'Body',
      createdAt: new Date('2026-07-01T00:00:00.000Z'),
      sender: { name: 'Prof', email: 'prof@x.edu' },
      course: { title: 'Chem 101' },
      badge: null,
      ...overrides.message,
    },
  };
}

function reminderRequest(body: unknown) {
  return new NextRequest('http://localhost/api/courses/course-1/badges/badge-1/reminders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function reminderContext() {
  return { params: Promise.resolve({ courseId: 'course-1', badgeId: 'badge-1' }) };
}

function asChecker(options: {
  allowCheckerMessages?: boolean;
  allowCrossSectionView: boolean;
  sections: string[];
  extra?: Record<string, unknown>;
}) {
  mockPrisma.course.findFirst.mockResolvedValue({
    createdById: 'someone-else',
    settings: {
      allowCheckerMessages: options.allowCheckerMessages ?? true,
      allowCrossSectionView: options.allowCrossSectionView,
    },
    enrollments: [{ role: 'CHECKER', sections: options.sections.map((section) => ({ section })) }],
    ...options.extra,
  });
}

function patchContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  jest.clearAllMocks();
  signedInAs('instructor@example.edu');
  mockPrisma.user.findUnique.mockResolvedValue({ id: 'sender-1' });
});

describe('GET /api/messages', () => {
  it('returns the signed-in user received messages', async () => {
    mockPrisma.messageReceipt.findMany.mockResolvedValue([receiptRow()]);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.count).toBe(1);
    expect(body.messages[0]).toMatchObject({ id: 'm1', read: false, senderName: 'Prof', courseTitle: 'Chem 101' });
    expect(mockPrisma.messageReceipt.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'sender-1' } })
    );
  });

  it('falls back to the course instructor name when the sender has none', async () => {
    mockPrisma.messageReceipt.findMany.mockResolvedValue([
      receiptRow({
        message: {
          sender: { name: null, email: 'prof@x.edu' },
          course: { title: 'Chem 101', createdBy: { name: 'Prof Alice' } },
        },
      }),
    ]);

    const response = await GET();
    const body = await response.json();

    expect(body.messages[0]).toMatchObject({ senderName: 'Prof Alice', courseTitle: 'Chem 101' });
  });

  it('rejects unauthenticated callers', async () => {
    signedInAs(null);
    const response = await GET();
    expect(response.status).toBe(401);
  });
});

describe('POST /api/messages', () => {
  beforeEach(() => {
    // Default: sender is the course creator.
    mockPrisma.course.findFirst.mockResolvedValue({
      createdById: 'sender-1',
      settings: { allowCheckerMessages: false, allowCrossSectionView: false },
      enrollments: [],
    });
    mockPrisma.enrollment.findMany.mockResolvedValue([{ studentId: 'student-1', sections: [] }]);
    mockPrisma.message.create.mockResolvedValue({ id: 'm1' });
  });

  it('requires a courseId', async () => {
    const response = await POST(postRequest({ recipientId: 'student-1', body: 'Hi' }));
    expect(response.status).toBe(400);
  });

  it('requires a body', async () => {
    const response = await POST(postRequest({ courseId: 'course-1', recipientId: 'student-1' }));
    expect(response.status).toBe(400);
  });

  it('requires a recipient or allStudents', async () => {
    const response = await POST(postRequest({ courseId: 'course-1', body: 'Hi' }));
    expect(response.status).toBe(400);
  });

  it('rejects senders without course permission', async () => {
    mockPrisma.course.findFirst.mockResolvedValue(null);
    const response = await POST(postRequest({ courseId: 'course-1', recipientId: 'student-1', body: 'Hi' }));
    expect(response.status).toBe(403);
    expect(mockPrisma.message.create).not.toHaveBeenCalled();
  });

  it('blocks a checker when checker messaging is disabled', async () => {
    mockPrisma.course.findFirst.mockResolvedValue({
      createdById: 'someone-else',
      settings: { allowCheckerMessages: false, allowCrossSectionView: false },
      enrollments: [{ role: 'CHECKER', sections: [] }],
    });
    const response = await POST(postRequest({ courseId: 'course-1', recipientId: 'student-1', body: 'Hi' }));
    expect(response.status).toBe(403);
    expect(mockPrisma.message.create).not.toHaveBeenCalled();
  });

  it('allows a checker when checker messaging is enabled', async () => {
    mockPrisma.course.findFirst.mockResolvedValue({
      createdById: 'someone-else',
      settings: { allowCheckerMessages: true, allowCrossSectionView: false },
      enrollments: [{ role: 'CHECKER', sections: [] }],
    });
    const response = await POST(postRequest({ courseId: 'course-1', recipientId: 'student-1', body: 'Hi' }));
    expect(response.status).toBe(201);
  });

  it('sends to a single enrolled student', async () => {
    const response = await POST(
      postRequest({ courseId: 'course-1', recipientId: 'student-1', subject: 'Reminder', body: 'Please finish.' })
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.sent).toBe(1);
    expect(mockPrisma.enrollment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ studentId: 'student-1' }) })
    );
    expect(mockPrisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          senderId: 'sender-1',
          courseId: 'course-1',
          audience: 'DIRECT',
          subject: 'Reminder',
          body: 'Please finish.',
          receipts: { create: [{ userId: 'student-1' }] },
        }),
      })
    );
  });

  it('sends to every student when allStudents is set', async () => {
    mockPrisma.enrollment.findMany.mockResolvedValue([
      { studentId: 's1', sections: [] },
      { studentId: 's2', sections: [] },
    ]);
    mockPrisma.message.create.mockResolvedValue({ id: 'm1' });

    const response = await POST(postRequest({ courseId: 'course-1', allStudents: true, body: 'Class-wide notice.' }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.sent).toBe(2);
  });

  it('returns 404 when the recipient is not a student in the course', async () => {
    mockPrisma.enrollment.findMany.mockResolvedValue([]);
    const response = await POST(postRequest({ courseId: 'course-1', recipientId: 'ghost', body: 'Hi' }));
    expect(response.status).toBe(404);
    expect(mockPrisma.message.create).not.toHaveBeenCalled();
  });

  it('limits a checker blast to their own sections', async () => {
    asChecker({ allowCrossSectionView: false, sections: ['A'] });
    mockPrisma.enrollment.findMany.mockResolvedValue([
      { studentId: 's1', sections: [{ section: 'A' }] },
      { studentId: 's2', sections: [{ section: 'B' }] },
    ]);

    const response = await POST(postRequest({ courseId: 'course-1', allStudents: true, body: 'Section note.' }));
    const body = await response.json();

    expect(body.sent).toBe(1);
    expect(mockPrisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ receipts: { create: [{ userId: 's1' }] } }) })
    );
  });

  it('lets a checker reach every section when cross-section view is on', async () => {
    asChecker({ allowCrossSectionView: true, sections: ['A'] });
    mockPrisma.enrollment.findMany.mockResolvedValue([
      { studentId: 's1', sections: [{ section: 'A' }] },
      { studentId: 's2', sections: [{ section: 'B' }] },
    ]);

    const response = await POST(postRequest({ courseId: 'course-1', allStudents: true, body: 'Course note.' }));
    expect((await response.json()).sent).toBe(2);
  });

  it('does not section-limit an instructor', async () => {
    mockPrisma.enrollment.findMany.mockResolvedValue([
      { studentId: 's1', sections: [{ section: 'A' }] },
      { studentId: 's2', sections: [{ section: 'B' }] },
    ]);

    const response = await POST(postRequest({ courseId: 'course-1', allStudents: true, body: 'Course note.' }));
    expect((await response.json()).sent).toBe(2);
  });

  it('returns 404 when a checker targets a student outside their sections', async () => {
    asChecker({ allowCrossSectionView: false, sections: ['A'] });
    mockPrisma.enrollment.findMany.mockResolvedValue([{ studentId: 's2', sections: [{ section: 'B' }] }]);

    const response = await POST(postRequest({ courseId: 'course-1', recipientId: 's2', body: 'Hi' }));
    expect(response.status).toBe(404);
    expect(mockPrisma.message.create).not.toHaveBeenCalled();
  });
});

// Reminders live on their own route but answer to the same permission rules, so
// they are covered here rather than in a separate suite.
describe('POST /api/courses/[courseId]/badges/[badgeId]/reminders', () => {
  beforeEach(() => {
    mockPrisma.course.findFirst.mockResolvedValue({
      id: 'course-1',
      createdById: 'sender-1',
      settings: { allowCheckerMessages: false, allowCrossSectionView: false },
      enrollments: [],
    });
    mockPrisma.enrollment.findMany.mockResolvedValue([
      { studentId: 's1', sections: [] },
      { studentId: 's2', sections: [] },
    ]);
    mockPrisma.studentBadge.findMany.mockResolvedValue([]);
    mockPrisma.message.create.mockResolvedValue({ id: 'm1' });
  });

  it('skips students who already completed the badge', async () => {
    mockPrisma.studentBadge.findMany.mockResolvedValue([{ studentId: 's2' }]);

    const response = await reminderPOST(reminderRequest({ body: 'Please finish.' }), reminderContext());
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.sent).toBe(1);
    expect(mockPrisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          badgeId: 'badge-1',
          audience: 'BADGE_INCOMPLETE',
          receipts: { create: [{ userId: 's1' }] },
        }),
      })
    );
  });

  it('blocks a checker when checker messaging is disabled', async () => {
    asChecker({
      allowCheckerMessages: false,
      allowCrossSectionView: false,
      sections: [],
      extra: { id: 'course-1' },
    });

    const response = await reminderPOST(reminderRequest({ body: 'Please finish.' }), reminderContext());

    expect(response.status).toBe(403);
    expect(mockPrisma.message.create).not.toHaveBeenCalled();
  });

  it('allows a checker when checker messaging is enabled', async () => {
    asChecker({ allowCheckerMessages: true, allowCrossSectionView: false, sections: [], extra: { id: 'course-1' } });

    const response = await reminderPOST(reminderRequest({ body: 'Please finish.' }), reminderContext());

    expect(response.status).toBe(201);
  });

  it('limits a checker reminder to their own sections', async () => {
    asChecker({ allowCheckerMessages: true, allowCrossSectionView: false, sections: ['A'], extra: { id: 'course-1' } });
    mockPrisma.enrollment.findMany.mockResolvedValue([
      { studentId: 's1', sections: [{ section: 'A' }] },
      { studentId: 's2', sections: [{ section: 'B' }] },
    ]);

    const response = await reminderPOST(reminderRequest({ body: 'Please finish.' }), reminderContext());
    const body = await response.json();

    expect(body.sent).toBe(1);
    expect(mockPrisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ receipts: { create: [{ userId: 's1' }] } }) })
    );
  });
});

describe('PATCH /api/messages/[id]', () => {
  it('marks an unread message as read', async () => {
    mockPrisma.messageReceipt.findUnique.mockResolvedValue({ id: 'r1', readAt: null });
    mockPrisma.messageReceipt.update.mockResolvedValue({});

    const response = await PATCH(
      new Request('http://localhost/api/messages/m1', { method: 'PATCH' }),
      patchContext('m1')
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.read).toBe(true);
    expect(mockPrisma.messageReceipt.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'r1' }, data: expect.objectContaining({ readAt: expect.any(Date) }) })
    );
  });

  it('is a no-op for an already-read message', async () => {
    mockPrisma.messageReceipt.findUnique.mockResolvedValue({
      id: 'r1',
      readAt: new Date('2026-07-01T00:00:00.000Z'),
    });

    const response = await PATCH(
      new Request('http://localhost/api/messages/m1', { method: 'PATCH' }),
      patchContext('m1')
    );
    expect(response.status).toBe(200);
    expect(mockPrisma.messageReceipt.update).not.toHaveBeenCalled();
  });

  it('refuses to mark a message the caller did not receive', async () => {
    // No receipt for this caller: the message never reached them.
    mockPrisma.messageReceipt.findUnique.mockResolvedValue(null);

    const response = await PATCH(
      new Request('http://localhost/api/messages/m1', { method: 'PATCH' }),
      patchContext('m1')
    );
    expect(response.status).toBe(404);
    expect(mockPrisma.messageReceipt.update).not.toHaveBeenCalled();
  });
});
