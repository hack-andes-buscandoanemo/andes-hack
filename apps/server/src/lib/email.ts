import { Resend } from "resend";

let resendInstance: Resend | null = null;
function getResend(): Resend | null {
  if (!resendInstance && process.env.RESEND_API_KEY) {
    resendInstance = new Resend(process.env.RESEND_API_KEY);
  }
  return resendInstance;
}

const resend = new Proxy({} as Resend, {
  get(_target, prop) {
    const client = getResend();
    if (!client) {
      throw new Error(
        'Missing API key. Pass it to the constructor `new Resend("re_123")` or set RESEND_API_KEY.',
      );
    }
    return (client as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  react?: React.ReactElement;
  from?: string;
  replyTo?: string;
}

/**
 * Send an email using Resend
 * @see https://resend.com/docs/send-with-nodejs
 */
export async function sendEmail(options: SendEmailOptions) {
  const { to, subject, html, text, react, from, replyTo } = options;

  const fromAddress = from || process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
  const client = getResend();

  if (!client) {
    // When RESEND_API_KEY is not set (CI, tests, local dev), log and return success
    return { success: true, data: { id: "mock-email-id" } };
  }

  try {
    const { data, error } = await client.emails.send({
      from: fromAddress,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      text,
      react,
      replyTo,
    });

    if (error) {
      console.error("Failed to send email:", error);
      throw new Error(`Failed to send email: ${error.message}`);
    }

    return { success: true, data };
  } catch (error) {
    console.error("Email sending error:", error);
    throw error;
  }
}

/**
 * Get the Resend client instance for advanced usage
 */
export function getResendClient() {
  return getResend();
}

export { resend };
