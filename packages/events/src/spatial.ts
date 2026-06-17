// Fan-out for spatial-aggregation batch events. The SDK accumulates client-side
// and flushes ONE event carrying many cells/points in `properties` (see
// docs/adr/0003); this expands that batch into the per-row shapes the dedicated
// ClickHouse tables consume. Pure and injectable (`now`) so it is unit-testable
// without a clock — mirrors `toClickHouseEvent`.

import { z } from "zod";

import type { SpatialCellRow, TrajectoryPointRow } from "./contract";
import { SPATIAL_EVENT_TYPES } from "./contract";
import type { IncomingEvent } from "./incoming";
import { formatTimestamp } from "./timestamps";

export class SpatialBatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpatialBatchError";
  }
}

const SPATIAL_TYPES: ReadonlySet<string> = new Set(SPATIAL_EVENT_TYPES);

/** Whether ingest should fan this event out instead of writing it to `events`. */
export const isSpatialEventType = (type: string): boolean =>
  SPATIAL_TYPES.has(type);

// [gx, gy, gz, value] for cells; [x, y, z, t_ms] for trajectory points.
const tuple4 = z.tuple([z.number(), z.number(), z.number(), z.number()]);

const cellsProps = z.object({
  cell_size: z.number().positive(),
  cells: z.array(tuple4),
  kind: z.string().min(1),
});

const trajectoryProps = z.object({
  points: z.array(tuple4),
});

export interface ExpandedBatch {
  cells: SpatialCellRow[];
  points: TrajectoryPointRow[];
}

const expandCells = (
  event: IncomingEvent,
  projectId: string,
  day: string
): SpatialCellRow[] => {
  const parsed = cellsProps.safeParse(event.properties);
  if (!parsed.success) {
    throw new SpatialBatchError(`malformed ${event.type} properties`);
  }

  const { cell_size, cells, kind } = parsed.data;
  return cells.map(([gx, gy, gz, value]) => ({
    cell_size,
    day,
    gx: Math.trunc(gx),
    gy: Math.trunc(gy),
    gz: Math.trunc(gz),
    hits: 1,
    kind,
    project_id: projectId,
    scene: event.scene,
    value,
  }));
};

const expandTrajectory = (
  event: IncomingEvent,
  projectId: string
): TrajectoryPointRow[] => {
  const parsed = trajectoryProps.safeParse(event.properties);
  if (!parsed.success) {
    throw new SpatialBatchError("malformed trajectory properties");
  }

  return parsed.data.points.map(([px, py, pz, tMs], seq) => ({
    player_id: event.player_id,
    pos_x: px,
    pos_y: py,
    pos_z: pz,
    project_id: projectId,
    scene: event.scene,
    seq,
    session_id: event.session_id,
    timestamp: formatTimestamp(new Date(tMs)),
  }));
};

/**
 * Expand one validated spatial batch event into rollup rows. `spatial_cells`
 * yields {@link SpatialCellRow}s (one per cell, `kind` from properties);
 * `trajectory` yields ordered
 * {@link TrajectoryPointRow}s. Throws {@link SpatialBatchError} on a malformed
 * `properties` shape so the caller can answer 400.
 */
export const expandSpatialBatch = (
  event: IncomingEvent,
  projectId: string,
  now: Date = new Date()
): ExpandedBatch => {
  const empty: ExpandedBatch = { cells: [], points: [] };

  if (event.type === "trajectory") {
    return { ...empty, points: expandTrajectory(event, projectId) };
  }

  if (event.type === "spatial_cells") {
    const day = formatTimestamp(event.timestamp ?? now).slice(0, 10);
    return { ...empty, cells: expandCells(event, projectId, day) };
  }

  throw new SpatialBatchError(`not a spatial event type: ${event.type}`);
};
