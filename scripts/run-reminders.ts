// Runs one feedback-reminder pass directly, without the cron route.
//   npm run reminders:run
//   npm run reminders:run -- --now=2026-11-10   (simulate a later cycle)
import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd(), true);

async function main() {
  const flag = process.argv.find((arg) => arg.startsWith('--now='));
  const now = flag ? new Date(flag.slice('--now='.length)) : new Date();
  if (Number.isNaN(now.getTime())) {
    console.error('Invalid --now date.');
    process.exit(1);
  }
  const { runFeedbackReminders } = await import('../lib/reminders/feedbackReminders');
  console.log(`Running feedback reminders as of ${now.toISOString()}`);
  console.log(await runFeedbackReminders(now));
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
