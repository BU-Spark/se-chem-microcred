// Sends one email through lib/email/resend.ts to check RESEND_API_KEY and
// EMAIL_FROM before testing the feature itself.
//   npm run email:test -- you@example.com
import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd(), true);

async function main() {
  const to = process.argv[2];
  if (!to) {
    console.error('Usage: npm run email:test -- you@example.com');
    process.exit(1);
  }
  const { sendEmails } = await import('../lib/email/resend');
  const { instructorMessageEmail } = await import('../lib/email/templates');
  const [result] = await sendEmails(
    [
      instructorMessageEmail({
        to,
        courseTitle: 'Chem Skills test',
        senderName: null,
        subject: 'Test email',
        body: 'If you can read this, Resend is configured correctly.',
      }),
    ],
    `test-${Date.now()}`
  );
  console.log(result);
  process.exit(result.status === 'SENT' ? 0 : 1);
}

main();
