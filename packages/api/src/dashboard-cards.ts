import { z } from "zod";

import { queryConfigSchema } from "./query-builder";

export const cardSizeSchema = z.enum(["Third", "Half", "TwoThirds", "Full"]);

export const BUILTIN_CARD_TYPES = [
  "metric.events",
  "metric.players",
  "metric.sessions",
  "chart.events-per-day",
  "list.events-by-type",
] as const;

export const CUSTOM_CARD_TYPE = "custom.stat";

const MAX_CARD_TITLE_LENGTH = 80;

/**
 * Built-in cards carry no config beyond an optional project binding. On the
 * org overview, a present `projectId` pins the card to one project; absent
 * means the card aggregates org-wide. On the project overview it is ignored.
 */
export const builtinCardConfigSchema = z.object({
  projectId: z.string().min(1).optional(),
});

/**
 * Custom stat cards store a user-defined query. `projectId` and `timeRange`
 * are never persisted — they are injected at render time from the card
 * binding and the dashboard's global time range.
 */
export const customCardConfigSchema = z
  .object({
    display: z.enum(["metric", "timeseries"]),
    projectId: z.string().min(1).optional(),
    query: queryConfigSchema.omit({ projectId: true, timeRange: true }),
    title: z.string().min(1).max(MAX_CARD_TITLE_LENGTH),
  })
  .superRefine((config, ctx) => {
    if (config.display === "metric" && config.query.granularity !== "none") {
      ctx.addIssue({
        code: "custom",
        message: 'Metric display requires granularity "none"',
        path: ["query", "granularity"],
      });
    }
    if (
      config.display === "timeseries" &&
      config.query.granularity === "none"
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Timeseries display requires a time granularity",
        path: ["query", "granularity"],
      });
    }
  });

export const cardSchema = z.discriminatedUnion("cardType", [
  z.object({
    cardType: z.enum(BUILTIN_CARD_TYPES),
    config: builtinCardConfigSchema,
    id: z.string().min(1).optional(),
    size: cardSizeSchema,
  }),
  z.object({
    cardType: z.literal(CUSTOM_CARD_TYPE),
    config: customCardConfigSchema,
    id: z.string().min(1).optional(),
    size: cardSizeSchema,
  }),
]);

export type DashboardCardInput = z.infer<typeof cardSchema>;
export type BuiltinCardType = (typeof BUILTIN_CARD_TYPES)[number];
export type DashboardCardType = BuiltinCardType | typeof CUSTOM_CARD_TYPE;
export type CardSizeValue = z.infer<typeof cardSizeSchema>;
export type BuiltinCardConfig = z.infer<typeof builtinCardConfigSchema>;
export type CustomCardConfig = z.infer<typeof customCardConfigSchema>;

export interface DashboardCardSnapshot {
  cardType: string;
  config: unknown;
  id: string;
  position: number;
  size: CardSizeValue;
}

const buildDefaultCards = (prefix: string): DashboardCardSnapshot[] => [
  {
    cardType: "metric.events",
    config: {},
    id: `${prefix}-metric-events`,
    position: 0,
    size: "Third",
  },
  {
    cardType: "metric.players",
    config: {},
    id: `${prefix}-metric-players`,
    position: 1,
    size: "Third",
  },
  {
    cardType: "metric.sessions",
    config: {},
    id: `${prefix}-metric-sessions`,
    position: 2,
    size: "Third",
  },
  {
    cardType: "chart.events-per-day",
    config: {},
    id: `${prefix}-chart-events-per-day`,
    position: 3,
    size: "Full",
  },
  {
    cardType: "list.events-by-type",
    config: {},
    id: `${prefix}-list-events-by-type`,
    position: 4,
    size: "Full",
  },
];

/** Rendered in-memory when no Dashboard row exists; mirrors today's overview. */
export const DEFAULT_PROJECT_OVERVIEW = buildDefaultCards("default-project");
export const DEFAULT_ORG_OVERVIEW = buildDefaultCards("default-org");
