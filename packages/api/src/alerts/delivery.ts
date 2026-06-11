import type { AlertChannel } from "@sbox-analytics/db";
// Alert delivery, behind a seam. The runner depends on the `AlertNotifier`
// interface, never on `fetch` or Resend directly, so the full evaluate ->
// deliver pipeline is exercised in tests with an in-memory notifier. The
// production notifier's two transports (webhook, email) are themselves
// injectable so each can be unit-tested without real network or Resend.
import { sendEmail } from "@sbox-analytics/email";
import type { EmailMessage } from "@sbox-analytics/email";

export type { EmailMessage } from "@sbox-analytics/email";

export interface AlertNotification {
  ruleName: string;
  /** e.g. "project Galaxy Wars" or "organization Acme". */
  scopeLabel: string;
  /** Human label for the metric, e.g. "Crash spike". */
  metricLabel: string;
  /** One-line description of what tripped (from the evaluator). */
  summary: string;
  channel: AlertChannel;
  /** Webhook URL or destination email address. */
  destination: string;
  /** When the alert fired, ISO string. */
  firedAt: string;
}

// The delivery seam. The runner takes one of these; production wires the
// webhook/email transports, tests record calls.
export interface AlertNotifier {
  notify(notification: AlertNotification): Promise<void>;
}

export interface NotifierTransports {
  fetchFn: (url: string, init?: RequestInit) => Promise<Response>;
  sendEmail: (message: EmailMessage) => Promise<void>;
}

const buildEmailHtml = (notification: AlertNotification): string => `
  <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
    <h2>${notification.metricLabel} alert</h2>
    <p><strong>${notification.ruleName}</strong> on ${notification.scopeLabel} fired.</p>
    <p>${notification.summary}</p>
    <p style="color: #71717a; font-size: 13px;">Fired at ${notification.firedAt}</p>
  </div>
`;

// Production email transport: the shared @sbox-analytics/email package sends via
// Resend when configured and reports back when it isn't, so we surface a dev
// warning to keep the alert visible in logs.
const defaultSendEmail = async (message: EmailMessage): Promise<void> => {
  const sent = await sendEmail(message);
  if (!sent) {
    console.warn(
      `[alerts] RESEND_API_KEY not set — email to ${message.to}: ${message.subject}`
    );
  }
};

const productionTransports: NotifierTransports = {
  fetchFn: (url, init) => fetch(url, init),
  sendEmail: defaultSendEmail,
};

/**
 * The production notifier. Webhook channels POST a JSON body to the
 * destination URL; email channels send through Resend. Transports default to
 * the real implementations and are overridable for tests.
 */
export const createAlertNotifier = (
  transports: NotifierTransports = productionTransports
): AlertNotifier => ({
  async notify(notification) {
    if (notification.channel === "Webhook") {
      await transports.fetchFn(notification.destination, {
        body: JSON.stringify({
          firedAt: notification.firedAt,
          metric: notification.metricLabel,
          rule: notification.ruleName,
          scope: notification.scopeLabel,
          summary: notification.summary,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      return;
    }

    await transports.sendEmail({
      html: buildEmailHtml(notification),
      subject: `[s&box Analytics] ${notification.metricLabel} alert: ${notification.ruleName}`,
      to: notification.destination,
    });
  },
});
