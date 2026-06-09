// Production wiring for alert evaluation: the Prisma-backed AlertStore and the
// real deliverer (fetch webhook + Resend email). Kept apart from the runner so
// unit tests never pull in Prisma or Resend.
import prisma from "@sbox-analytics/db";

import type { AlertDeliverer } from "./delivery";
import { createAlertDeliverer } from "./delivery";
import { createResendEmailSender } from "./resend-email";
import type { AlertRuleRecord, AlertStore } from "./runner";

export const createAlertStore = (): AlertStore => ({
  listEnabledRules: (projectId: string): Promise<AlertRuleRecord[]> =>
    prisma.alertRule.findMany({
      select: {
        channel: true,
        destination: true,
        id: true,
        lastFiredAt: true,
        metric: true,
        name: true,
        threshold: true,
      },
      where: { enabled: true, projectId },
    }),

  markFired: async (id: string, firedAt: Date): Promise<void> => {
    await prisma.alertRule.update({
      data: { lastFiredAt: firedAt },
      where: { id },
    });
  },

  projectName: async (projectId: string): Promise<string | null> => {
    const project = await prisma.project.findFirst({
      select: { name: true },
      where: { id: projectId },
    });
    return project?.name ?? null;
  },
});

export const createLiveDeliverer = (): AlertDeliverer =>
  createAlertDeliverer({ sendEmail: createResendEmailSender() });
