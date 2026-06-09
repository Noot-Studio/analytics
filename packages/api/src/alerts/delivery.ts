// Alert delivery, split from the wiring that picks a concrete channel.
// `AlertDeliverer` is the seam: the runner calls it, tests pass a fake, and the
// production deliverer (see ./live) plugs in a real webhook + email sender. This
// module imports neither Resend nor Prisma, so it is safe to unit-test directly.
import type { AlertMetricName } from "./evaluate";

// Everything a channel needs to render a notification for one fired rule.
export interface AlertNotification {
  projectId: string;
  projectName: string;
  ruleId: string;
  ruleName: string;
  metric: AlertMetricName;
  value: number;
  threshold: number;
  summary: string;
  // ISO timestamp of when the breach was detected.
  firedAt: string;
}

// Channel to deliver over — matches the Prisma `AlertChannel` enum's values.
export type AlertChannelName = "Webhook" | "Email";

export interface AlertDeliverer {
  webhook(url: string, notification: AlertNotification): Promise<void>;
  email(to: string, notification: AlertNotification): Promise<void>;
}

// Route a notification to the right channel. The single place that maps a rule's
// configured channel onto the deliverer, so the runner stays channel-agnostic.
export const deliverNotification = (
  deliverer: AlertDeliverer,
  channel: AlertChannelName,
  destination: string,
  notification: AlertNotification
): Promise<void> => {
  if (channel === "Webhook") {
    return deliverer.webhook(destination, notification);
  }
  return deliverer.email(destination, notification);
};

// JSON body POSTed to a webhook destination.
export const buildWebhookPayload = (notification: AlertNotification) => ({
  firedAt: notification.firedAt,
  message: notification.summary,
  metric: notification.metric,
  project: { id: notification.projectId, name: notification.projectName },
  rule: { id: notification.ruleId, name: notification.ruleName },
  threshold: notification.threshold,
  value: notification.value,
});

// HTML body for an email destination.
export const buildEmailHtml = (notification: AlertNotification): string => `
  <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
    <h2>Alert: ${notification.ruleName}</h2>
    <p>${notification.summary}</p>
    <p style="color: #71717a; font-size: 13px;">
      Project: ${notification.projectName}<br />
      Detected at: ${notification.firedAt}
    </p>
  </div>
`;

// `fetch` is injected so the POST can be exercised without real network I/O.
type FetchFn = typeof fetch;

// Production webhook delivery: POST the JSON payload, fail loudly on a non-2xx so
// the runner doesn't record a delivery that never landed.
export const postWebhook = async (
  url: string,
  notification: AlertNotification,
  fetchFn: FetchFn = fetch
): Promise<void> => {
  const response = await fetchFn(url, {
    body: JSON.stringify(buildWebhookPayload(notification)),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(`Webhook delivery failed with status ${response.status}`);
  }
};

export type SendEmail = (
  to: string,
  notification: AlertNotification
) => Promise<void>;

// Assemble a deliverer from a real webhook poster and an injected email sender.
// Keeping the email sender a parameter is what lets this module stay free of the
// Resend import (which lives in ./resend-email).
export const createAlertDeliverer = (deps: {
  sendEmail: SendEmail;
}): AlertDeliverer => ({
  email: (to, notification) => deps.sendEmail(to, notification),
  webhook: (url, notification) => postWebhook(url, notification),
});
