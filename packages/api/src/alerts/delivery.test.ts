import { describe, expect, it } from "bun:test";

import type { AlertDeliverer, AlertNotification } from "./delivery";
import {
  buildEmailHtml,
  buildWebhookPayload,
  deliverNotification,
  postWebhook,
} from "./delivery";

const notification: AlertNotification = {
  firedAt: "2026-06-09T12:00:00.000Z",
  metric: "CrashSpike",
  projectId: "proj_1",
  projectName: "My Game",
  ruleId: "rule_1",
  ruleName: "Crash spike",
  summary: "12 crashes in the last hour (threshold 10).",
  threshold: 10,
  value: 12,
};

const recordingDeliverer = () => {
  const webhooks: { url: string; notification: AlertNotification }[] = [];
  const emails: { to: string; notification: AlertNotification }[] = [];
  const deliverer: AlertDeliverer = {
    email: (to, n) => {
      emails.push({ notification: n, to });
      return Promise.resolve();
    },
    webhook: (url, n) => {
      webhooks.push({ notification: n, url });
      return Promise.resolve();
    },
  };
  return { deliverer, emails, webhooks };
};

describe("deliverNotification", () => {
  it("routes a Webhook rule to the webhook channel", async () => {
    const { deliverer, emails, webhooks } = recordingDeliverer();

    await deliverNotification(
      deliverer,
      "Webhook",
      "https://hooks.test/in",
      notification
    );

    expect(webhooks).toEqual([{ notification, url: "https://hooks.test/in" }]);
    expect(emails).toEqual([]);
  });

  it("routes an Email rule to the email channel", async () => {
    const { deliverer, emails, webhooks } = recordingDeliverer();

    await deliverNotification(deliverer, "Email", "ops@test.com", notification);

    expect(emails).toEqual([{ notification, to: "ops@test.com" }]);
    expect(webhooks).toEqual([]);
  });
});

describe("postWebhook", () => {
  it("POSTs the JSON payload to the destination", async () => {
    const calls: { url: string; init: RequestInit | undefined }[] = [];
    const fakeFetch = ((url: string, init?: RequestInit) => {
      calls.push({ init, url });
      return Promise.resolve(new Response(null, { status: 200 }));
    }) as unknown as typeof fetch;

    await postWebhook("https://hooks.test/in", notification, fakeFetch);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://hooks.test/in");
    expect(calls[0]?.init?.method).toBe("POST");
    expect(JSON.parse(calls[0]?.init?.body as string)).toEqual(
      buildWebhookPayload(notification)
    );
  });

  it("throws when the webhook responds with a non-2xx status", async () => {
    const fakeFetch = (() =>
      Promise.resolve(
        new Response(null, { status: 500 })
      )) as unknown as typeof fetch;

    await expect(
      postWebhook("https://hooks.test/in", notification, fakeFetch)
    ).rejects.toThrow("status 500");
  });
});

describe("payload builders", () => {
  it("captures rule, project, and breach in the webhook payload", () => {
    expect(buildWebhookPayload(notification)).toEqual({
      firedAt: "2026-06-09T12:00:00.000Z",
      message: "12 crashes in the last hour (threshold 10).",
      metric: "CrashSpike",
      project: { id: "proj_1", name: "My Game" },
      rule: { id: "rule_1", name: "Crash spike" },
      threshold: 10,
      value: 12,
    });
  });

  it("renders the rule name and summary into the email body", () => {
    const html = buildEmailHtml(notification);
    expect(html).toContain("Crash spike");
    expect(html).toContain("12 crashes in the last hour");
    expect(html).toContain("My Game");
  });
});
