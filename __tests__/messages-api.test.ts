/** @jest-environment node */

import { currentUser } from '@clerk/nextjs/server';

import { GET, POST } from '../app/api/messages/route';
import { PATCH } from '../app/api/messages/[id]/route';
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
    message: {
      findMany: jest.fn(),
      createMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

const mockCurrentUser = currentUser as jest.MockedFunction<typeof currentUser>;
const mockPrisma = prisma as unknown as {
  user: { findUnique: jest.Mock };
  course: { findFirst: jest.Mock };
  enrollment: { findMany: jest.Mock };
  message: { findMany: jest.Mock; createMany: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
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
    mockPrisma.message.findMany.mockResolvedValue([
      {
        id: 'm1',
        subject: 'Hello',
        body: 'Body',
        readAt: null,
        createdAt: new Date('2026-07-01T00:00:00.000Z'),
        sender: { name: 'Prof', email: 'prof@x.edu' },
        course: { title: 'Chem 101' },
        badge: null,
      },
    ]);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.count).toBe(1);
    expect(body.messages[0]).toMatchObject({ id: 'm1', read: false, senderName: 'Prof', courseTitle: 'Chem 101' });
    expect(mockPrisma.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { recipientId: 'sender-1' } })
    );
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
      settings: { allowAssessorMessages: false },
      enrollments: [],
    });
    mockPrisma.enrollment.findMany.mockResolvedValue([{ studentId: 'student-1' }]);
    mockPrisma.message.createMany.mockResolvedValue({ count: 1 });
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
    expect(mockPrisma.message.createMany).not.toHaveBeenCalled();
  });

  it('blocks a checker when assessor messaging is disabled', async () => {
    mockPrisma.course.findFirst.mockResolvedValue({
      createdById: 'someone-else',
      settings: { allowAssessorMessages: false },
      enrollments: [{ role: 'CHECKER' }],
    });
    const response = await POST(postRequest({ courseId: 'course-1', recipientId: 'student-1', body: 'Hi' }));
    expect(response.status).toBe(403);
    expect(mockPrisma.message.createMany).not.toHaveBeenCalled();
  });

  it('allows a checker when assessor messaging is enabled', async () => {
    mockPrisma.course.findFirst.mockResolvedValue({
      createdById: 'someone-else',
      settings: { allowAssessorMessages: true },
      enrollments: [{ role: 'CHECKER' }],
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
    expect(mockPrisma.message.createMany).toHaveBeenCalledWith({
      data: [
        {
          recipientId: 'student-1',
          senderId: 'sender-1',
          courseId: 'course-1',
          subject: 'Reminder',
          body: 'Please finish.',
        },
      ],
    });
  });

  it('sends to every student when allStudents is set', async () => {
    mockPrisma.enrollment.findMany.mockResolvedValue([{ studentId: 's1' }, { studentId: 's2' }]);
    mockPrisma.message.createMany.mockResolvedValue({ count: 2 });

    const response = await POST(postRequest({ courseId: 'course-1', allStudents: true, body: 'Class-wide notice.' }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.sent).toBe(2);
  });

  it('returns 404 when the recipient is not a student in the course', async () => {
    mockPrisma.enrollment.findMany.mockResolvedValue([]);
    const response = await POST(postRequest({ courseId: 'course-1', recipientId: 'ghost', body: 'Hi' }));
    expect(response.status).toBe(404);
    expect(mockPrisma.message.createMany).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/messages/[id]', () => {
  it('marks an unread message as read', async () => {
    mockPrisma.message.findUnique.mockResolvedValue({ id: 'm1', recipientId: 'sender-1', readAt: null });
    mockPrisma.message.update.mockResolvedValue({});

    const response = await PATCH(
      new Request('http://localhost/api/messages/m1', { method: 'PATCH' }),
      patchContext('m1')
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.read).toBe(true);
    expect(mockPrisma.message.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'm1' }, data: expect.objectContaining({ readAt: expect.any(Date) }) })
    );
  });

  it('is a no-op for an already-read message', async () => {
    mockPrisma.message.findUnique.mockResolvedValue({
      id: 'm1',
      recipientId: 'sender-1',
      readAt: new Date('2026-07-01T00:00:00.000Z'),
    });

    const response = await PATCH(
      new Request('http://localhost/api/messages/m1', { method: 'PATCH' }),
      patchContext('m1')
    );
    expect(response.status).toBe(200);
    expect(mockPrisma.message.update).not.toHaveBeenCalled();
  });

  it('refuses to mark a message the caller did not receive', async () => {
    mockPrisma.message.findUnique.mockResolvedValue({ id: 'm1', recipientId: 'other-user', readAt: null });

    const response = await PATCH(
      new Request('http://localhost/api/messages/m1', { method: 'PATCH' }),
      patchContext('m1')
    );
    expect(response.status).toBe(404);
    expect(mockPrisma.message.update).not.toHaveBeenCalled();
  });
});
