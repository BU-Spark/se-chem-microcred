export type DeliveryChannel = 'IN_APP' | 'EMAIL' | 'BOTH';

export const DELIVERY_OPTIONS: Array<{ value: DeliveryChannel; label: string }> = [
  { value: 'IN_APP', label: 'In-app message' },
  { value: 'EMAIL', label: 'Email (BU address)' },
  { value: 'BOTH', label: 'In-app and email' },
];

export type SendResult = {
  sent: number;
  emailed: number;
  emailFailed: number;
  emailSkipped: number;
  emailNotConfigured: number;
};

export const EMAIL_NOT_CONFIGURED_TEXT =
  'Email is not set up on the server yet (no Resend API key), so no emails were sent.';

export function readSendResult(payload: Record<string, unknown>): SendResult {
  const count = (value: unknown) => (typeof value === 'number' ? value : 0);
  return {
    sent: count(payload.sent),
    emailed: count(payload.emailed),
    emailFailed: count(payload.emailFailed),
    emailSkipped: count(payload.emailSkipped),
    emailNotConfigured: count(payload.emailNotConfigured),
  };
}

// Extra line for the confirmation when email was part of the send; null for
// an in-app-only send so the existing confirmation reads as before.
export function describeEmailOutcome(channel: DeliveryChannel, result: SendResult): string | null {
  if (channel === 'IN_APP' || result.sent === 0) return null;
  if (result.emailNotConfigured > 0 && result.emailed === 0) return EMAIL_NOT_CONFIGURED_TEXT;
  const parts = [`${result.emailed} email${result.emailed === 1 ? '' : 's'} sent`];
  if (result.emailFailed > 0) parts.push(`${result.emailFailed} failed`);
  if (result.emailSkipped > 0) parts.push(`${result.emailSkipped} skipped (no email on file)`);
  return `${parts.join(', ')}.`;
}
