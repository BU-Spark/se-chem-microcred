/** @jest-environment node */

import { POST } from '../app/api/cron/feedback-reminders/route';
import { runFeedbackReminders } from '../lib/reminders/feedbackReminders';

jest.mock('../lib/reminders/feedbackReminders', () => ({ runFeedbackReminders: jest.fn() }));

const mockRun = runFeedbackReminders as jest.MockedFunction<typeof runFeedbackReminders>;
const summary = {
  coursesChecked: 1,
  eligible: 1,
  sent: 1,
  skippedDuplicate: 0,
  skippedNoEmail: 0,
  skippedNotConfigured: 0,
  failed: 0,
};

function cronRequest(authorization?: string, query = '') {
  return new Request(`http://localhost/api/cron/feedback-reminders${query}`, {
    method: 'POST',
    headers: authorization ? { authorization } : {},
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.CRON_SECRET = 'test-secret';
  mockRun.mockResolvedValue(summary);
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

describe('POST /api/cron/feedback-reminders', () => {
  it('rejects a request without the secret', async () => {
    const response = await POST(cronRequest());
    expect(response.status).toBe(401);
    expect(mockRun).not.toHaveBeenCalled();
  });

  it('rejects a wrong secret', async () => {
    const response = await POST(cronRequest('Bearer nope'));
    expect(response.status).toBe(401);
  });

  it('rejects everything when no secret is configured', async () => {
    delete process.env.CRON_SECRET;
    const response = await POST(cronRequest('Bearer '));
    expect(response.status).toBe(401);
  });

  it('runs the reminders and returns the summary', async () => {
    const response = await POST(cronRequest('Bearer test-secret'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(summary);
  });

  it('honors ?now outside production', async () => {
    await POST(cronRequest('Bearer test-secret', '?now=2026-11-10T00:00:00.000Z'));
    expect(mockRun).toHaveBeenCalledWith(new Date('2026-11-10T00:00:00.000Z'));
  });
});
