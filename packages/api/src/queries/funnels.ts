// Pure ClickHouse query builders for the funnels route.
// No DB/network access — fully unit-testable.
import type { BuiltQuery } from "./types";

// Funnel step-count bounds — the zod input schema in the router reads these to
// constrain `steps`, so they're exported rather than kept router-private.
export const MIN_FUNNEL_STEPS = 2;
export const MAX_FUNNEL_STEPS = 8;
export const DEFAULT_FUNNEL_WINDOW_SECONDS = 86_400;

export interface FunnelsInput {
  projectId: string;
  from: string;
  to: string;
  steps: string[];
  windowSeconds: number;
}

// One {s0…sN}=event_type binding plus the windowFunnel CTE shared by both
// queries; conditions interpolate the ordered step params 1:1.
const funnelsBase = (
  input: FunnelsInput
): {
  levelsCte: string;
  params: Record<string, unknown>;
} => {
  const conditions = input.steps
    .map((_step, index) => `event_type = {s${index}:String}`)
    .join(", ");
  const stepParams = Object.fromEntries(
    input.steps.map((value, index) => [`s${index}`, value])
  );
  const params = {
    from: input.from,
    projectId: input.projectId,
    steps: input.steps,
    to: input.to,
    window: input.windowSeconds,
    ...stepParams,
  };

  const levelsCte = `
        WITH levels AS (
          SELECT
            player_id,
            toDate(min(timestamp)) AS first_day,
            windowFunnel({window:UInt32})(timestamp, ${conditions}) AS level
          FROM analytics.events
          WHERE project_id = {projectId:String}
            AND toDate(timestamp) BETWEEN {from:Date} AND {to:Date}
            AND event_type IN {steps:Array(String)}
          GROUP BY player_id
        )
      `;

  return { levelsCte, params };
};

// Player counts per furthest funnel level reached (1-indexed; 0 = no entry).
export const buildFunnelsLevelsQuery = (input: FunnelsInput): BuiltQuery => {
  const { levelsCte, params } = funnelsBase(input);

  const query = `${levelsCte}
            SELECT level, toUInt64(count()) AS players
            FROM levels
            WHERE level > 0
            GROUP BY level
            ORDER BY level
          `;

  return { params, query };
};

// First-touch conversion trend: started vs fully-completed players per day.
export const buildFunnelsTrendQuery = (input: FunnelsInput): BuiltQuery => {
  const { levelsCte, params } = funnelsBase(input);

  const query = `${levelsCte}
            SELECT
              toString(first_day)                            AS day,
              toUInt64(count())                              AS started,
              toUInt64(countIf(level >= {fullLevel:UInt8}))  AS completed
            FROM levels
            WHERE level > 0
            GROUP BY first_day
            ORDER BY first_day
          `;

  return {
    params: { ...params, fullLevel: input.steps.length },
    query,
  };
};
