// Shared alert-rule schemas and the snapshot the dashboard consumes. Kept as a
// plain (unrefined) object so the router can compose it onto the org/project
// scope input with `.extend`; the destination-vs-channel cross-check lives in
// the router as a BAD_REQUEST so the input schema stays composable.
import { AlertChannel, AlertMetric } from "@sbox-analytics/db";
import { z } from "zod";

export const alertMetricSchema = z.enum(AlertMetric);
export const alertChannelSchema = z.enum(AlertChannel);

export const alertRuleInputSchema = z.object({
  channel: alertChannelSchema,
  destination: z.string().min(1).max(500),
  enabled: z.boolean().default(true),
  metric: alertMetricSchema,
  name: z.string().min(1).max(100),
  threshold: z.number().positive(),
});

export type AlertRuleInput = z.infer<typeof alertRuleInputSchema>;

export interface AlertRuleSnapshot {
  id: string;
  name: string;
  metric: AlertMetric;
  threshold: number;
  channel: AlertChannel;
  destination: string;
  enabled: boolean;
  projectId: string | null;
  lastFiredAt: string | null;
  updatedAt: string;
}
