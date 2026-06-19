// Pure ClickHouse query builders for the pre-aggregated spatial pipeline
// (docs/adr/0003): the `spatial_cells` SummingMergeTree rollup (dwell/visit
// heatmaps) and the `trajectory_points` ordered path store. No DB/network
// access — fully unit-testable, fed into runQuery by the route layer.
//
// Distinct from spatial-query.ts, which bins raw `analytics.events` positions at
// query time. Here the grid is fixed at capture (`cellSize`); `voxelSize` only
// re-bins COARSER by summing whole multiples of it.

import type { BuiltQuery } from "./queries/types";

// Open metric label — `dwell`, `visits`, or any game-defined scalar the SDK
// accumulated. The rollup sums by whatever string lands here.
export type HeatmapKind = string;

export interface HeatmapInput {
  projectId: string;
  scene: string;
  kind: HeatmapKind;
  cellSize: number;
  from: string;
  to: string;
  /** Display bin size; must be a multiple of `cellSize`. Defaults to `cellSize`. */
  voxelSize?: number;
  limit: number;
}

export interface TrajectoryInput {
  projectId: string;
  scene: string;
  playerId: string;
  sessionId?: string;
  from: string;
  to: string;
  limit: number;
}

export interface SpatialKindsInput {
  projectId: string;
  scene: string;
  from: string;
  to: string;
}

export interface TrajectoryPlayersInput {
  projectId: string;
  scene: string;
  from: string;
  to: string;
  limit: number;
}

export interface TrajectoriesInput {
  projectId: string;
  scene: string;
  from: string;
  to: string;
  limit: number;
}

/** World-space center of coarse bin index `g` for a cube edge of `voxelSize`. */
export const voxelCenter = (g: number, voxelSize: number): number =>
  (g + 0.5) * voxelSize;

/**
 * Distinct (kind, cell_size) pairs captured for a scene — lets the dashboard
 * offer only the heatmaps that exist, since the rollup is keyed by `cell_size`
 * and a query for the wrong size returns nothing.
 */
export const buildSpatialKindsQuery = (
  input: SpatialKindsInput
): BuiltQuery => {
  const query = `
    SELECT DISTINCT
      kind,
      cell_size AS cellSize
    FROM analytics.spatial_cells
    WHERE project_id = {projectId:String}
      AND scene = {scene:String}
      AND day BETWEEN {from:Date} AND {to:Date}
    ORDER BY kind, cellSize
  `;

  return {
    params: {
      from: input.from,
      projectId: input.projectId,
      scene: input.scene,
      to: input.to,
    },
    query,
  };
};

/**
 * Players that have a captured trajectory in a scene, with point counts — so
 * the dashboard can offer a picker before pulling one player's full path.
 */
export const buildTrajectoryPlayersQuery = (
  input: TrajectoryPlayersInput
): BuiltQuery => {
  const query = `
    SELECT
      player_id AS playerId,
      count() AS points
    FROM analytics.trajectory_points
    WHERE project_id = {projectId:String}
      AND scene = {scene:String}
      AND toDate(timestamp) BETWEEN {from:Date} AND {to:Date}
    GROUP BY player_id
    ORDER BY points DESC
    LIMIT {limit:UInt32}
  `;

  return {
    params: {
      from: input.from,
      limit: input.limit,
      projectId: input.projectId,
      scene: input.scene,
      to: input.to,
    },
    query,
  };
};

// floor(g * cellSize / voxelSize): identity when voxelSize == cellSize.
const binAxis = (axis: string): string =>
  `toInt32(floor(${axis} * {cellSize:Float64} / {voxelSize:Float64}))`;

/**
 * Sum dwell ms (or visit counts) per cell from the rollup. With `voxelSize` >
 * `cellSize` the stored cells are re-binned coarser: a cell index `g` maps to
 * the world coord `g * cellSize`, then floored into the `voxelSize` grid.
 */
export const buildHeatmapQuery = (input: HeatmapInput): BuiltQuery => {
  const voxelSize = input.voxelSize ?? input.cellSize;

  const params: Record<string, unknown> = {
    cellSize: input.cellSize,
    from: input.from,
    kind: input.kind,
    limitPlusOne: input.limit + 1,
    projectId: input.projectId,
    scene: input.scene,
    to: input.to,
    voxelSize,
  };

  const query = `
    SELECT
      ${binAxis("gx")} AS gx,
      ${binAxis("gy")} AS gy,
      ${binAxis("gz")} AS gz,
      sum(value) AS value,
      sum(hits) AS hits
    FROM analytics.spatial_cells
    WHERE project_id = {projectId:String}
      AND scene = {scene:String}
      AND kind = {kind:String}
      AND cell_size = {cellSize:Float32}
      AND day BETWEEN {from:Date} AND {to:Date}
    GROUP BY gx, gy, gz
    ORDER BY value DESC
    LIMIT {limitPlusOne:UInt32}
  `;

  return { params, query };
};

/**
 * Ordered trajectory points for one player, optionally one session. Ordered by
 * time then seq so replay follows capture order across flush windows.
 */
export const buildTrajectoryQuery = (input: TrajectoryInput): BuiltQuery => {
  const params: Record<string, unknown> = {
    from: input.from,
    limit: input.limit,
    playerId: input.playerId,
    projectId: input.projectId,
    scene: input.scene,
    to: input.to,
  };

  const where = [
    "project_id = {projectId:String}",
    "scene = {scene:String}",
    "player_id = {playerId:String}",
    "toDate(timestamp) BETWEEN {from:Date} AND {to:Date}",
  ];

  if (input.sessionId) {
    where.push("session_id = {sessionId:String}");
    params.sessionId = input.sessionId;
  }

  const query = `
    SELECT
      session_id,
      seq,
      pos_x,
      pos_y,
      pos_z,
      toString(timestamp) AS timestamp
    FROM analytics.trajectory_points
    WHERE ${where.join("\n      AND ")}
    ORDER BY session_id, timestamp, seq
    LIMIT {limit:UInt32}
  `;

  return { params, query };
};

/**
 * Ordered trajectory points for EVERY player in a scene/range, for the editor's
 * Path Lines view. Sorted by player then session then capture order, so the
 * route can slice the flat result into one path per (player, session) with a
 * single forward scan. Point-capped like the single-player query.
 */
export const buildTrajectoriesQuery = (
  input: TrajectoriesInput
): BuiltQuery => {
  const query = `
    SELECT
      player_id,
      session_id,
      pos_x,
      pos_y,
      pos_z
    FROM analytics.trajectory_points
    WHERE project_id = {projectId:String}
      AND scene = {scene:String}
      AND toDate(timestamp) BETWEEN {from:Date} AND {to:Date}
    ORDER BY player_id, session_id, timestamp, seq
    LIMIT {limit:UInt32}
  `;

  return {
    params: {
      from: input.from,
      limit: input.limit,
      projectId: input.projectId,
      scene: input.scene,
      to: input.to,
    },
    query,
  };
};
