import { Resend } from 'resend';

// Resend's batch endpoint takes at most 100 emails per call.
const BATCH_LIMIT = 100;

export type OutgoingEmail = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export type EmailResult =
  | { status: 'SENT'; id: string | null }
  | { status: 'FAILED'; error: string }
  | { status: 'SKIPPED'; error: string };

// Reason recorded when the server has no Resend key/sender, so callers can
// tell "email is off" apart from "this student has no address".
export const EMAIL_NOT_CONFIGURED = 'Email is not configured.';

let client: Resend | null = null;

function getClient() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  client ??= new Resend(apiKey);
  return client;
}

export function isEmailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

function describe(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) return String(error.message);
  return 'Unknown email error';
}

// Sends each email and reports a result per email, in input order. Never
// throws: a failed send is recorded by the caller, it does not undo the
// message. Without RESEND_API_KEY / EMAIL_FROM (local dev, tests) every email
// is SKIPPED, so nothing is sent by accident.
export async function sendEmails(emails: OutgoingEmail[], idempotencyPrefix: string): Promise<EmailResult[]> {
  const resend = getClient();
  const from = process.env.EMAIL_FROM;
  if (!resend || !from) {
    console.warn(`[email] RESEND_API_KEY or EMAIL_FROM not set; skipped ${emails.length} email(s).`);
    return emails.map(() => ({ status: 'SKIPPED', error: EMAIL_NOT_CONFIGURED }));
  }

  const results: EmailResult[] = [];
  for (let start = 0; start < emails.length; start += BATCH_LIMIT) {
    const chunk = emails.slice(start, start + BATCH_LIMIT);
    try {
      // Permissive validation: one bad address fails only its own email, not
      // the other 99 in the chunk.
      const response = await resend.batch.send(
        chunk.map((email) => ({ from, ...email })),
        { idempotencyKey: `${idempotencyPrefix}-${start / BATCH_LIMIT}`, batchValidation: 'permissive' }
      );
      if (response.error) {
        const error = describe(response.error);
        console.error(`[email] batch ${idempotencyPrefix} failed:`, error);
        results.push(...chunk.map((): EmailResult => ({ status: 'FAILED', error })));
        continue;
      }

      const failures = new Map((response.data.errors ?? []).map((failure) => [failure.index, failure.message]));
      // Ids come back for the accepted emails only, in order.
      const ids = response.data.data.map((sent) => sent.id);
      let nextId = 0;
      chunk.forEach((_, index) => {
        const error = failures.get(index);
        if (error) {
          console.error(`[email] ${idempotencyPrefix} #${start + index} rejected:`, error);
          results.push({ status: 'FAILED', error });
        } else {
          results.push({ status: 'SENT', id: ids[nextId++] ?? null });
        }
      });
    } catch (error) {
      const message = describe(error);
      console.error(`[email] batch ${idempotencyPrefix} threw:`, message);
      results.push(...chunk.map((): EmailResult => ({ status: 'FAILED', error: message })));
    }
  }
  return results;
}
