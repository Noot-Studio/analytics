// Adapts the alert notification shape onto the shared email transport
// (@sbox-analytics/email). Isolated from ./delivery so the testable delivery
// code carries no Resend import; the transport's own dev fallback logs the
// alert when no Resend key is configured.
import { sendEmail } from "@sbox-analytics/email";

import type { AlertNotification, SendEmail } from "./delivery";
import { buildEmailHtml } from "./delivery";

export const createResendEmailSender =
  (): SendEmail =>
  (to: string, notification: AlertNotification): Promise<void> =>
    sendEmail({
      html: buildEmailHtml(notification),
      subject: `Alert: ${notification.ruleName} — s&box Analytics`,
      to,
    });
