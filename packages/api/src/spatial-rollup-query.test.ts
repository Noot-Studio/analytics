import { describe, expect, it } from "bun:test";

import {
  buildHeatmapQuery,
  buildSpatialKindsQuery,
  buildTrajectoryPlayersQuery,
  buildTrajectoryQuery,
  voxelCenter,
} from "./spatial-rollup-query";
import type { HeatmapInput, TrajectoryInput } from "./spatial-rollup-query";

const heatmapBase: HeatmapInput = {
  cellSize: 128,
  from: "2026-05-01",
  kind: "dwell",
  limit: 50_000,
  projectId: "proj_1",
  scene: "de_dust2",
  to: "2026-06-01",
};

describe("voxelCenter", () => {
  it("returns the world center of a coarse bin", () => {
    expect(voxelCenter(0, 128)).toBe(64);
    expect(voxelCenter(-1, 128)).toBe(-64);
  });
});

describe("buildHeatmapQuery", () => {
  it("sums value/hits from the rollup, keyed by project/scene/kind/cell_size", () => {
    const { query, params } = buildHeatmapQuery(heatmapBase);
    expect(query).toContain("FROM analytics.spatial_cells");
    expect(query).toContain("sum(value) AS value");
    expect(query).toContain("sum(hits) AS hits");
    expect(query).toContain("project_id = {projectId:String}");
    expect(query).toContain("scene = {scene:String}");
    expect(query).toContain("kind = {kind:String}");
    expect(query).toContain("cell_size = {cellSize:Float32}");
    expect(query).toContain("day BETWEEN {from:Date} AND {to:Date}");
    expect(query).toContain("GROUP BY gx, gy, gz");
    expect(query).toContain("ORDER BY value DESC");
    expect(params).toMatchObject({
      cellSize: 128,
      kind: "dwell",
      limitPlusOne: 50_001,
      projectId: "proj_1",
      scene: "de_dust2",
      voxelSize: 128,
    });
  });

  it("defaults voxelSize to cellSize (identity re-bin)", () => {
    const { params } = buildHeatmapQuery(heatmapBase);
    expect(params.voxelSize).toBe(128);
  });

  it("re-bins coarser when voxelSize is given", () => {
    const { query, params } = buildHeatmapQuery({
      ...heatmapBase,
      voxelSize: 256,
    });
    expect(params.voxelSize).toBe(256);
    expect(query).toContain(
      "toInt32(floor(gx * {cellSize:Float64} / {voxelSize:Float64})) AS gx"
    );
  });

  it("queries the visits rollup when kind=visits", () => {
    const { params } = buildHeatmapQuery({ ...heatmapBase, kind: "visits" });
    expect(params.kind).toBe("visits");
  });
});

const trajectoryBase: TrajectoryInput = {
  from: "2026-05-01",
  limit: 10_000,
  playerId: "anon_1",
  projectId: "proj_1",
  scene: "de_dust2",
  to: "2026-06-01",
};

describe("buildTrajectoryQuery", () => {
  it("orders points by session/time/seq for one player", () => {
    const { query, params } = buildTrajectoryQuery(trajectoryBase);
    expect(query).toContain("FROM analytics.trajectory_points");
    expect(query).toContain("player_id = {playerId:String}");
    expect(query).toContain("ORDER BY session_id, timestamp, seq");
    expect(query).not.toContain("session_id = {sessionId:String}");
    expect(params.sessionId).toBeUndefined();
  });

  it("adds the session filter + param when sessionId is set", () => {
    const { query, params } = buildTrajectoryQuery({
      ...trajectoryBase,
      sessionId: "sess_9",
    });
    expect(query).toContain("session_id = {sessionId:String}");
    expect(params.sessionId).toBe("sess_9");
  });
});

describe("buildTrajectoryPlayersQuery", () => {
  it("counts trajectory points per player for a scene in range", () => {
    const { query, params } = buildTrajectoryPlayersQuery({
      from: "2026-05-01",
      limit: 500,
      projectId: "proj_1",
      scene: "de_dust2",
      to: "2026-06-01",
    });
    expect(query).toContain("FROM analytics.trajectory_points");
    expect(query).toContain("player_id AS playerId");
    expect(query).toContain("count() AS points");
    expect(query).toContain("GROUP BY player_id");
    expect(query).toContain("ORDER BY points DESC");
    expect(params).toEqual({
      from: "2026-05-01",
      limit: 500,
      projectId: "proj_1",
      scene: "de_dust2",
      to: "2026-06-01",
    });
  });
});

describe("buildSpatialKindsQuery", () => {
  it("selects distinct kind/cell_size for a scene in range", () => {
    const { query, params } = buildSpatialKindsQuery({
      from: "2026-05-01",
      projectId: "proj_1",
      scene: "de_dust2",
      to: "2026-06-01",
    });
    expect(query).toContain("SELECT DISTINCT");
    expect(query).toContain("cell_size AS cellSize");
    expect(query).toContain("FROM analytics.spatial_cells");
    expect(query).toContain("scene = {scene:String}");
    expect(params).toEqual({
      from: "2026-05-01",
      projectId: "proj_1",
      scene: "de_dust2",
      to: "2026-06-01",
    });
  });
});
