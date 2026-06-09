// Production email delivery via Resend. Isolated from ./delivery so the testable
// delivery code carries no Resend import. Mirrors packages/auth/src/emails.ts:
// without a key configured, the alert is logged instead of sent so local dev
// still works.
import { env } from "@sbox-analytics/env/server";
import { Resend } from "resend";

import type { AlertNotification, SendEmail } from "./delivery";
import { buildEmailHtml } from "./delivery";

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

export const createResendEmailSender =
  (): SendEmail =>
  async (to: string, notification: AlertNotification): Promise<void> => {
    if (!resend) {
      // Dev fallback: no Resend key configured, surface the alert in the console.
      console.warn(
        `[alerts] RESEND_API_KEY not set — alert "${notification.ruleName}" for ${to}: ${notification.summary}`
      );
      return;
    }

    await resend.emails.send({
      from: env.EMAIL_FROM,
      html: buildEmailHtml(notification),
      subject: `Alert: ${notification.ruleName} — s&box Analytics`,
      to,
    });
  };
