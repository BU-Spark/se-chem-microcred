/** @jest-environment node */

import { appUrl, feedbackReminderEmail, instructorMessageEmail } from './templates';

const ORIGIN_VARS = ['NEXT_PUBLIC_APP_URL', 'APP_URL', 'RAILWAY_PUBLIC_DOMAIN'] as const;
const saved = Object.fromEntries(ORIGIN_VARS.map((name) => [name, process.env[name]]));

beforeEach(() => {
  for (const name of ORIGIN_VARS) delete process.env[name];
});

afterAll(() => {
  for (const name of ORIGIN_VARS) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }
});

describe('appUrl', () => {
  it('falls back to the local dev server when nothing is configured', () => {
    expect(appUrl('/messages')).toBe('http://localhost:3000/messages');
  });

  it('uses the same configured public origin as QR codes', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://chem.example.edu/';
    expect(appUrl('/messages')).toBe('https://chem.example.edu/messages');
  });

  it('accepts a bare Railway domain', () => {
    process.env.RAILWAY_PUBLIC_DOMAIN = 'chem-skills.up.railway.app';
    expect(appUrl('/messages')).toBe('https://chem-skills.up.railway.app/messages');
  });

  it('prefers the request origin over configuration', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://configured.example.edu';
    expect(appUrl('/messages', 'https://request.example.edu')).toBe('https://request.example.edu/messages');
  });
});

describe('email links', () => {
  it("links instructor messages to the student's course dashboard on the request origin", () => {
    const email = instructorMessageEmail({
      to: 's@example.edu',
      courseId: 'course 1',
      courseTitle: 'Chem 101',
      senderName: 'Dr. X',
      subject: 'Hi',
      body: 'Body',
      origin: 'https://chem.example.edu',
    });
    expect(email.text).toContain('https://chem.example.edu/course_dashboard?courseId=course%201');
    expect(email.html).toContain('href="https://chem.example.edu/course_dashboard?courseId=course%201"');
  });

  it('links feedback reminders to the configured origin', () => {
    process.env.APP_URL = 'https://chem.example.edu';
    const email = feedbackReminderEmail({
      to: 's@example.edu',
      courseTitle: 'Chem 101',
      badgeTitle: 'Titration',
      badgeSlug: 'titration',
    });
    expect(email.text).toContain('https://chem.example.edu/badges/titration/feedback');
  });
});
