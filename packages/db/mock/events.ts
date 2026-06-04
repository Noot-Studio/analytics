import {
  DEMO_CPUS,
  DEMO_GPUS_BY_PLATFORM,
  DEMO_MAPS,
  DEMO_OSES_BY_PLATFORM,
  DEMO_PLATFORMS,
  DEMO_PROJECT,
  DEMO_RAM_GB,
  DEMO_RESOLUTIONS,
  DEMO_VERSIONS,
} from "./demo";
import { createRng } from "./rng";
import type { Rng } from "./rng";

// Row shape matching the `analytics.events` ClickHouse table (JSONEachRow insert).
export interface MockEvent {
  project_id: string;
  event_type: string;
  /** "YYYY-MM-DD HH:mm:ss.SSS" UTC — DateTime64(3) literal. */
  timestamp: string;
  session_id: string;
  player_id: string;
  /** JSON-encoded event properties. */
  properties: string;
  /** Scene/map for spatial events; "" for non-spatial events. */
  scene: string;
  pos_x: number | null;
  pos_y: number | null;
  pos_z: number | null;
}

export interface GenerateEventsOptions {
  /** Project the events belong to. Defaults to the demo project. */
  projectId?: string;
  /** Number of distinct players. */
  playerCount?: number;
  /** Size of the activity window in days, ending at `endDate`. */
  days?: number;
  /** End of the window (most recent day). Defaults to now. */
  endDate?: Date;
  /** PRNG seed for reproducibility. */
  seed?: number;
}

// One machine per player — stable across all of that player's sessions.
interface PlayerSpecs {
  os: string;
  gpu: string;
  cpu: string;
  ram_gb: number;
  resolution: string;
}

interface EventContext {
  projectId: string;
  playerId: string;
  sessionId: string;
  map: string;
  platform: string;
  version: string;
  specs: PlayerSpecs;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_PLAYER_COUNT = 40;
const DEFAULT_DAYS = 60;
const DEFAULT_SEED = 1337;

// Funnel the dashboard's funnels page reads, in order. Each step drops off.
const FUNNEL_STEPS = [
  "tutorial_start",
  "tutorial_complete",
  "first_match",
  "match_complete",
  "purchase",
] as const;
const FUNNEL_KEEP_PROBABILITY = 0.72;
const RETENTION_BASE = 0.55;
const RETENTION_DECAY_DAYS = 14;
const FIRST_SEEN_SKEW = 1.6;

const pad = (value: number, length = 2): string =>
  String(value).padStart(length, "0");

// Replicates apps/ingest formatTimestamp: UTC "YYYY-MM-DD HH:mm:ss.SSS".
const formatTimestamp = (date: Date): string =>
  `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}.${pad(date.getUTCMilliseconds(), 3)}`;

const makeEvent = (
  ctx: EventContext,
  eventType: string,
  at: Date,
  properties: Record<string, unknown>,
  spatial?: { scene: string; x: number; y: number; z: number }
): MockEvent => ({
  event_type: eventType,
  player_id: ctx.playerId,
  pos_x: spatial?.x ?? null,
  pos_y: spatial?.y ?? null,
  pos_z: spatial?.z ?? null,
  project_id: ctx.projectId,
  properties: JSON.stringify({ map: ctx.map, ...properties }),
  scene: spatial?.scene ?? "",
  session_id: ctx.sessionId,
  timestamp: formatTimestamp(at),
});

// Fixed kill zones so seeded death heatmaps are visibly non-uniform.
const DEATH_HOTSPOTS = [
  { x: 600, y: -400 },
  { x: -900, y: 200 },
  { x: 0, y: 800 },
] as const;

// A death clustered around one of the hotspots (engine-space coordinates).
const deathPosition = (rng: Rng, scene: string) => {
  const hotspot = rng.pick(DEATH_HOTSPOTS);
  return {
    scene,
    x: hotspot.x + rng.int(-120, 120),
    y: hotspot.y + rng.int(-120, 120),
    z: rng.int(0, 80),
  };
};

// A free-roam sample spread across the playable area.
const roamPosition = (rng: Rng, scene: string) => ({
  scene,
  x: rng.int(-1500, 1500),
  y: rng.int(-1500, 1500),
  z: rng.int(0, 300),
});

// One play session → a burst of correlated events sharing a session id.
const generateSession = (
  rng: Rng,
  ctx: EventContext,
  sessionStart: Date
): MockEvent[] => {
  const events: MockEvent[] = [];
  const durationSeconds = rng.int(120, 2400);
  const at = (offsetSeconds: number): Date =>
    new Date(sessionStart.getTime() + offsetSeconds * 1000);

  events.push(
    makeEvent(ctx, "session_start", sessionStart, {
      platform: ctx.platform,
      version: ctx.version,
      ...ctx.specs,
    })
  );
  events.push(
    makeEvent(ctx, "load_complete", at(rng.int(2, 12)), {
      ms: rng.int(800, 9000),
    })
  );

  // FPS telemetry sampled through the session — powers the performance page.
  const sampleCount = rng.int(3, 10);
  for (let i = 1; i <= sampleCount; i += 1) {
    const offset = Math.floor((durationSeconds * i) / (sampleCount + 1));
    events.push(
      makeEvent(
        ctx,
        "fps_sample",
        at(offset),
        {
          fps: rng.int(45, 240),
          platform: ctx.platform,
        },
        roamPosition(rng, ctx.map)
      )
    );
  }

  // Player deaths clustered around kill zones — powers the spatial death heatmap.
  const deathCount = rng.int(0, 3);
  for (let i = 0; i < deathCount; i += 1) {
    events.push(
      makeEvent(
        ctx,
        "player_death",
        at(rng.int(10, durationSeconds)),
        { weapon: rng.pick(["rifle", "shotgun", "pistol", "melee"]) },
        deathPosition(rng, ctx.map)
      )
    );
  }

  // Progression funnel with cumulative drop-off.
  let funnelOffset = rng.int(10, 40);
  for (const step of FUNNEL_STEPS) {
    if (!rng.chance(FUNNEL_KEEP_PROBABILITY)) {
      break;
    }
    funnelOffset += rng.int(15, 180);
    const props: Record<string, unknown> =
      step === "purchase"
        ? {
            price: rng.pick([4.99, 9.99, 19.99]),
            sku: rng.pick(["starter_pack", "skin_bundle", "battle_pass"]),
          }
        : {};
    events.push(
      makeEvent(ctx, step, at(Math.min(funnelOffset, durationSeconds)), props)
    );
  }

  // Occasional crash mid-session.
  if (rng.chance(0.06)) {
    events.push(
      makeEvent(ctx, "crash", at(rng.int(30, durationSeconds)), {
        reason: rng.pick(["null_ref", "gpu_hang", "oom", "assert_failed"]),
        version: ctx.version,
      })
    );
  }

  events.push(
    makeEvent(ctx, "session_end", at(durationSeconds), {
      duration_seconds: durationSeconds,
    })
  );

  return events;
};

// Decide on which days (after first-seen) a player returns. Engagement decays
// over time, producing realistic retention cohorts.
const activeDayOffsets = (
  rng: Rng,
  firstSeenOffset: number,
  days: number
): number[] => {
  const offsets: number[] = [firstSeenOffset];
  for (let day = firstSeenOffset + 1; day < days; day += 1) {
    const elapsed = day - firstSeenOffset;
    const retention =
      RETENTION_BASE * Math.exp(-elapsed / RETENTION_DECAY_DAYS);
    if (rng.chance(retention)) {
      offsets.push(day);
    }
  }
  return offsets;
};

/**
 * Generate a deterministic stream of demo analytics events spanning `days`,
 * covering every event type the dashboard reads. Pure given its options.
 */
export const generateDemoEvents = (
  options: GenerateEventsOptions = {}
): MockEvent[] => {
  const {
    projectId = DEMO_PROJECT.id,
    playerCount = DEFAULT_PLAYER_COUNT,
    days = DEFAULT_DAYS,
    endDate = new Date(),
    seed = DEFAULT_SEED,
  } = options;

  const rng = createRng(seed);
  const events: MockEvent[] = [];
  // Midnight UTC of the oldest day in the window.
  const windowStart = new Date(
    Date.UTC(
      endDate.getUTCFullYear(),
      endDate.getUTCMonth(),
      endDate.getUTCDate()
    ) -
      (days - 1) * MS_PER_DAY
  );

  for (let p = 0; p < playerCount; p += 1) {
    const playerId = `player_${pad(p + 1, 4)}`;
    const platform = rng.pick(DEMO_PLATFORMS);
    const version = rng.pick(DEMO_VERSIONS);
    // Apple Silicon is a single SoC — cpu mirrors the gpu chip on macOS.
    const gpu = rng.pick(DEMO_GPUS_BY_PLATFORM[platform]);
    const specs: PlayerSpecs = {
      cpu: platform === "macOS" ? gpu : rng.pick(DEMO_CPUS),
      gpu,
      os: rng.pick(DEMO_OSES_BY_PLATFORM[platform]),
      ram_gb: rng.pick(DEMO_RAM_GB),
      resolution: rng.pick(DEMO_RESOLUTIONS),
    };
    // Weight first-seen toward the start so most players have returning history.
    const firstSeenOffset = Math.floor(
      rng.next() ** FIRST_SEEN_SKEW * (days - 1)
    );

    for (const dayOffset of activeDayOffsets(rng, firstSeenOffset, days)) {
      const sessionsToday = rng.int(1, 3);
      for (let s = 0; s < sessionsToday; s += 1) {
        const startMs =
          windowStart.getTime() +
          dayOffset * MS_PER_DAY +
          rng.int(0, MS_PER_DAY - 60_000);
        const ctx: EventContext = {
          map: rng.pick(DEMO_MAPS),
          platform,
          playerId,
          projectId,
          sessionId: `sess_${playerId}_${dayOffset}_${s}`,
          specs,
          version,
        };
        events.push(...generateSession(rng, ctx, new Date(startMs)));
      }
    }
  }

  // Chronological order keeps inserts tidy and mirrors real ingestion.
  events.sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1));
  return events;
};
