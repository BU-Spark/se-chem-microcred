export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail(_options: SendEmailOptions) {
  // Placeholder implementation until Resend integration is configured.
  return {
    id: 'email-placeholder',
    delivered: false,
  };
}
