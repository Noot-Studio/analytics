import { DEMO_MAPS, DEMO_PROJECT } from "./demo";
import { formatTimestamp, pad } from "./events";
import { createRng } from "./rng";

// Row shape matching `analytics.trajectory_points` (JSONEachRow insert).
export interface MockTrajectoryPoint {
  project_id: string;
  scene: string;
  player_id: string;
  session_id: string;
  seq: number;
  pos_x: number;
  pos_y: number;
  pos_z: number;
  /** "YYYY-MM-DD HH:mm:ss.SSS" UTC — DateTime64(3) literal. */
  timestamp: string;
}

export interface GenerateTrajectoriesOptions {
  /** Project the paths belong to. Defaults to the demo project. */
  projectId?: string;
  /** How many distinct players have a captured path. */
  playerCount?: number;
  /** Size of the activity window in days, ending at `endDate`. */
  days?: number;
  /** End of the window (most recent day). Defaults to now. */
  endDate?: Date;
  /** PRNG seed for reproducibility. */
  seed?: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_PLAYER_COUNT = 16;
const DEFAULT_DAYS = 60;
const DEFAULT_SEED = 4242;

// One sample per 0.5s, matching AnalyticsTrajectoryComponent's default cadence.
const SAMPLE_MS = 500;
const POINTS_MIN = 24;
const POINTS_MAX = 64;
// World units travelled per sample, and the playable bounds (mirrors roamPosition).
const STEP = 90;
const BOUND_XY = 1500;
const BOUND_Z = 300;
const TURN_PROBABILITY = 0.25;

const clamp = (value: number, limit: number): number =>
  Math.max(-limit, Math.min(limit, value));

/**
 * Generate deterministic per-player trajectories — ordered random walks within
 * the same scenes and playable bounds as {@link generateDemoEvents}, so the
 * dashboard's Trajectory view has paths to replay. Pure given its options.
 */
export const generateDemoTrajectories = (
  options: GenerateTrajectoriesOptions = {}
): MockTrajectoryPoint[] => {
  const {
    projectId = DEMO_PROJECT.id,
    playerCount = DEFAULT_PLAYER_COUNT,
    days = DEFAULT_DAYS,
    endDate = new Date(),
    seed = DEFAULT_SEED,
  } = options;

  const rng = createRng(seed);
  const rows: MockTrajectoryPoint[] = [];
  const windowStart =
    Date.UTC(
      endDate.getUTCFullYear(),
      endDate.getUTCMonth(),
      endDate.getUTCDate()
    ) -
    (days - 1) * MS_PER_DAY;

  for (let p = 0; p < playerCount; p += 1) {
    const playerId = `player_${pad(p + 1, 4)}`;
    const sessions = rng.int(1, 2);

    for (let s = 0; s < sessions; s += 1) {
      const scene = rng.pick(DEMO_MAPS);
      const dayOffset = rng.int(0, days - 1);
      const startMs =
        windowStart + dayOffset * MS_PER_DAY + rng.int(0, MS_PER_DAY - 600_000);
      const sessionId = `sess_${playerId}_traj_${s}`;

      let x = rng.int(-BOUND_XY, BOUND_XY);
      let y = rng.int(-BOUND_XY, BOUND_XY);
      let z = rng.int(0, BOUND_Z);
      let dirX = rng.next() * 2 - 1;
      let dirY = rng.next() * 2 - 1;

      const points = rng.int(POINTS_MIN, POINTS_MAX);
      for (let i = 0; i < points; i += 1) {
        rows.push({
          player_id: playerId,
          pos_x: Math.round(x),
          pos_y: Math.round(y),
          pos_z: Math.round(z),
          project_id: projectId,
          scene,
          seq: i,
          session_id: sessionId,
          timestamp: formatTimestamp(new Date(startMs + i * SAMPLE_MS)),
        });

        // Occasionally change heading so paths bend instead of running straight.
        if (rng.chance(TURN_PROBABILITY)) {
          dirX = rng.next() * 2 - 1;
          dirY = rng.next() * 2 - 1;
        }
        x = clamp(x + dirX * STEP, BOUND_XY);
        y = clamp(y + dirY * STEP, BOUND_XY);
        z = clamp(z + rng.int(-20, 20), BOUND_Z);
      }
    }
  }

  return rows;
};
