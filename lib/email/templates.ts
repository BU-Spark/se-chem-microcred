import type { OutgoingEmail } from '@/lib/email/resend';
import { getConfiguredPublicOrigin } from '@/lib/requestOrigin';

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const LOCAL_ORIGIN = 'http://localhost:3000';

// Builds an absolute link for an email. `origin` is the request's public
// origin (getPublicOrigin, the same one QR codes use) when the email is sent
// from a user request. Without a request (cron, scripts) it falls back to the
// configured public origin (NEXT_PUBLIC_APP_URL / APP_URL /
// RAILWAY_PUBLIC_DOMAIN), then to the local dev server.
export function appUrl(path: string, origin?: string | null) {
  const base = (origin || getConfiguredPublicOrigin() || LOCAL_ORIGIN).replace(/\/+$/, '');
  return `${base}${path}`;
}

function layout(options: { heading: string; paragraphs: string[]; link: string; linkLabel: string; footer: string }) {
  const body = options.paragraphs
    .map((paragraph) => `<p style="margin:0 0 16px;white-space:pre-wrap">${escapeHtml(paragraph)}</p>`)
    .join('');
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#1f2937;line-height:1.5;max-width:560px;margin:0 auto;padding:24px">
<h2 style="margin:0 0 16px;font-size:18px">${escapeHtml(options.heading)}</h2>
${body}
<p style="margin:24px 0"><a href="${escapeHtml(options.link)}" style="background:#cc0000;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">${escapeHtml(options.linkLabel)}</a></p>
<p style="margin:0;color:#6b7280;font-size:12px">${escapeHtml(options.footer)}</p>
</body></html>`;
}

export function instructorMessageEmail(options: {
  to: string;
  courseId: string;
  courseTitle: string;
  senderName: string | null;
  subject: string;
  body: string;
  origin?: string | null;
}): OutgoingEmail {
  const from = options.senderName ? `${options.senderName}` : options.courseTitle;
  const link = appUrl(`/course_dashboard?courseId=${encodeURIComponent(options.courseId)}`, options.origin);
  const footer = `Sent from Checkd by ${from}.`;
  return {
    to: options.to,
    subject: `${options.subject} - ${options.courseTitle}`,
    html: layout({ heading: options.subject, paragraphs: [options.body], link, linkLabel: 'Open Checkd', footer }),
    text: `${options.subject}\n\n${options.body}\n\nOpen Checkd: ${link}\n\n${footer}`,
  };
}

export const FEEDBACK_REMINDER_SUBJECT = 'Review your feedback to finish your badge';

export function feedbackReminderBody(badgeTitle: string) {
  return `You passed the assessment for "${badgeTitle}". Review your feedback and submit your rating to finalize the badge.`;
}

export function feedbackReminderEmail(options: {
  to: string;
  courseTitle: string;
  badgeTitle: string;
  badgeSlug: string;
}): OutgoingEmail {
  const link = appUrl(`/badges/${encodeURIComponent(options.badgeSlug)}/feedback`);
  const body = feedbackReminderBody(options.badgeTitle);
  const footer = `Automated reminder from ${options.courseTitle}. Reminders stop once the badge is finalized.`;
  return {
    to: options.to,
    subject: `${FEEDBACK_REMINDER_SUBJECT} - ${options.courseTitle}`,
    html: layout({
      heading: FEEDBACK_REMINDER_SUBJECT,
      paragraphs: [body],
      link,
      linkLabel: 'Review feedback',
      footer,
    }),
    text: `${body}\n\nReview feedback: ${link}\n\n${footer}`,
  };
}
