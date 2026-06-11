// Shared alert-rule schemas and the snapshot the dashboard consumes. Kept as a
// plain (unrefined) object so the router can compose it onto the org/project
// scope input with `.extend`; the destination-vs-channel cross-check lives in
// the router as a BAD_REQUEST so the input schema stays composable.
//
// An alert watches a saved Metric (the same metrics widgets reference): the
// metric is evaluated as a scalar over `window` and the rule fires when that
// value crosses `threshold` in the `operator` direction.
import { AlertChannel, AlertOperator, AlertWindow } from "@sbox-analytics/db";
import { z } from "zod";

export const alertChannelSchema = z.enum(AlertChannel);
export const alertOperatorSchema = z.enum(AlertOperator);
export const alertWindowSchema = z.enum(AlertWindow);

export const alertRuleInputSchema = z.object({
  channel: alertChannelSchema,
  destination: z.string().min(1).max(500),
  enabled: z.boolean().default(true),
  metricId: z.string().min(1),
  name: z.string().min(1).max(100),
  operator: alertOperatorSchema,
  threshold: z.number(),
  window: alertWindowSchema,
});

export type AlertRuleInput = z.infer<typeof alertRuleInputSchema>;

export interface AlertRuleSnapshot {
  id: string;
  name: string;
  metricId: string;
  /** The watched metric's name, joined in so the list can label the rule. */
  metricName: string;
  operator: AlertOperator;
  window: AlertWindow;
  threshold: number;
  channel: AlertChannel;
  destination: string;
  enabled: boolean;
  projectId: string | null;
  lastFiredAt: string | null;
  updatedAt: string;
}
