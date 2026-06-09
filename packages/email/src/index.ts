import { env } from "@sbox-analytics/env/server";
import { Resend } from "resend";

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

/** Whether real emails can be delivered (Resend configured). */
export const canSendEmail = resend !== null;

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
}

/**
 * Send one transactional email through Resend. Without a key configured the
 * email is logged instead of sent so local dev still works — callers that need
 * to surface domain-specific dev output (e.g. an invite link) should branch on
 * `canSendEmail` before calling.
 */
export const sendEmail = async ({
  to,
  subject,
  html,
}: SendEmailParams): Promise<void> => {
  if (!resend) {
    console.warn(
      `[email] RESEND_API_KEY not set — skipped "${subject}" to ${to}`
    );
    return;
  }

  await resend.emails.send({
    from: env.EMAIL_FROM,
    html,
    subject,
    to,
  });
};
