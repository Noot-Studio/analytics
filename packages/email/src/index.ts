// The single Resend transport for the whole monorepo. Auth (invitations,
// verification) and alerts (threshold notifications) both send through here, so
// the Resend client, the `EMAIL_FROM` address, and the "not configured" dev
// fallback live in one place instead of being duplicated per feature.
import { env } from "@sbox-analytics/env/server";
import { Resend } from "resend";

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
}

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

/** Whether real emails can be delivered (Resend configured). */
export const canSendEmail = resend !== null;

/**
 * Send one transactional email through Resend. Returns `true` when the message
 * was handed to Resend, `false` when Resend isn't configured (dev/test) so the
 * caller can surface its own fallback. The `from` address is centralised here.
 */
export const sendEmail = async (message: EmailMessage): Promise<boolean> => {
  if (!resend) {
    return false;
  }
  await resend.emails.send({
    from: env.EMAIL_FROM,
    html: message.html,
    subject: message.subject,
    to: message.to,
  });
  return true;
};
