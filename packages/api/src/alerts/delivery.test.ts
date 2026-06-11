import { describe, expect, it } from "bun:test";

import { createAlertNotifier } from "./delivery";
import type { EmailMessage } from "./delivery";

const baseNotification = {
  destination: "",
  firedAt: "2026-06-11T11:00:00.000Z",
  metricLabel: "Crash spike",
  ruleName: "Crash watch",
  scopeLabel: "project Galaxy Wars",
  summary: "12 crashes in the last hour (threshold 10).",
} as const;

describe("createAlertNotifier", () => {
  it("POSTs a JSON body to the webhook destination", async () => {
    const webhookCalls: { url: string; method: string; body: unknown }[] = [];
    const fetchFn = ((url: string, init?: RequestInit) => {
      webhookCalls.push({
        body: JSON.parse(init?.body as string),
        method: init?.method ?? "GET",
        url,
      });
      return Promise.resolve(new Response(null, { status: 200 }));
    }) as unknown as typeof fetch;

    const notifier = createAlertNotifier({
      fetchFn,
      sendEmail: () => Promise.reject(new Error("should not email")),
    });

    await notifier.notify({
      ...baseNotification,
      channel: "Webhook",
      destination: "https://hooks.example.com/abc",
    });

    expect(webhookCalls).toEqual([
      {
        body: {
          firedAt: "2026-06-11T11:00:00.000Z",
          metric: "Crash spike",
          rule: "Crash watch",
          scope: "project Galaxy Wars",
          summary: "12 crashes in the last hour (threshold 10).",
        },
        method: "POST",
        url: "https://hooks.example.com/abc",
      },
    ]);
  });

  it("sends an email through the email transport", async () => {
    const emails: EmailMessage[] = [];
    const notifier = createAlertNotifier({
      fetchFn: (() =>
        Promise.reject(
          new Error("should not fetch")
        )) as unknown as typeof fetch,
      sendEmail: (message) => {
        emails.push(message);
        return Promise.resolve();
      },
    });

    await notifier.notify({
      ...baseNotification,
      channel: "Email",
      destination: "ops@example.com",
    });

    expect(emails).toEqual([
      {
        html: expect.stringContaining("12 crashes in the last hour"),
        subject: "[s&box Analytics] Crash spike alert: Crash watch",
        to: "ops@example.com",
      },
    ]);
  });
});
