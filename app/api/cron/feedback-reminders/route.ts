import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';

import { runFeedbackReminders } from '@/lib/reminders/feedbackReminders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(req.headers.get('authorization') ?? '');
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

// POST: run one pass of the feedback-review reminders. Called on a schedule by
// the Railway cron service with the shared CRON_SECRET; there is no user
// session, so Clerk is bypassed for this path in middleware.ts.
//
// Outside production, ?now=<ISO date> runs the pass as of that date so a later
// reminder cycle can be tested without waiting days.
export async function POST(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let now = new Date();
  const override = new URL(req.url).searchParams.get('now');
  if (override && process.env.NODE_ENV !== 'production') {
    const parsed = new Date(override);
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json({ error: 'Invalid now parameter.' }, { status: 400 });
    }
    now = parsed;
  }

  try {
    const summary = await runFeedbackReminders(now);
    console.log('[cron] feedback reminders', { now: now.toISOString(), ...summary });
    return NextResponse.json(summary, { status: 200 });
  } catch (error) {
    console.error('POST /api/cron/feedback-reminders failed:', error);
    return NextResponse.json({ error: 'Reminder run failed.' }, { status: 500 });
  }
}
