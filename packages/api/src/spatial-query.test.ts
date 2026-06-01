import { describe, expect, it } from "bun:test";

import {
  buildScenesQuery,
  buildVoxelsQuery,
  voxelCenter,
} from "./spatial-query";
import type { VoxelsInput } from "./spatial-query";

const base: VoxelsInput = {
  from: "2026-05-01",
  limit: 50_000,
  projectId: "proj_1",
  scene: "dm_arena",
  to: "2026-06-01",
  voxelSize: 32,
};

describe("voxelCenter", () => {
  it("returns the center of a grid cell", () => {
    expect(voxelCenter(0, 32)).toBe(16);
    expect(voxelCenter(-1, 32)).toBe(-16);
    expect(voxelCenter(3, 10)).toBe(35);
  });
});

describe("buildVoxelsQuery", () => {
  it("density-only: no metric -> value is NULL, no metricKey param", () => {
    const { query, params } = buildVoxelsQuery(base);
    expect(query).toContain("NULL AS value");
    expect(query).toContain("floor(pos_x / {voxelSize:Float64}) AS gx");
    expect(query).toContain("scene = {scene:String}");
    expect(query).toContain("pos_x IS NOT NULL");
    expect(query).toContain(
      "toDate(timestamp) BETWEEN {from:Date} AND {to:Date}"
    );
    expect(query).toContain("ORDER BY count DESC");
    expect(query).toContain("LIMIT {limitPlusOne:UInt32}");
    expect(query).not.toContain("event_type = {eventType:String}");
    expect(params).toMatchObject({
      from: "2026-05-01",
      limitPlusOne: 50_001,
      projectId: "proj_1",
      scene: "dm_arena",
      to: "2026-06-01",
      voxelSize: 32,
    });
    expect(params.metricKey).toBeUndefined();
    expect(params.eventType).toBeUndefined();
  });

  it("includes the event_type clause + param when eventType set", () => {
    const { query, params } = buildVoxelsQuery({
      ...base,
      eventType: "player_death",
    });
    expect(query).toContain("event_type = {eventType:String}");
    expect(params.eventType).toBe("player_death");
  });

  it("metric mode: emits agg(JSONExtractFloat(...)) and metricKey param", () => {
    const { query, params } = buildVoxelsQuery({
      ...base,
      metric: { agg: "avg", key: "fps" },
    });
    expect(query).toContain(
      "avg(JSONExtractFloat(properties, {metricKey:String})) AS value"
    );
    expect(params.metricKey).toBe("fps");
  });

  it("rejects an agg not in the allow-list", () => {
    expect(() =>
      buildVoxelsQuery({
        ...base,
        // @ts-expect-error testing runtime guard
        metric: { agg: "drop tables", key: "fps" },
      })
    ).toThrow();
  });

  it("bounds mode: adds three BETWEEN clauses + 6 numeric params", () => {
    const { query, params } = buildVoxelsQuery({
      ...base,
      bounds: {
        maxX: 100,
        maxY: 50,
        maxZ: 200,
        minX: -100,
        minY: -50,
        minZ: 0,
      },
    });
    expect(query).toContain("pos_x BETWEEN {minX:Float64} AND {maxX:Float64}");
    expect(query).toContain("pos_y BETWEEN {minY:Float64} AND {maxY:Float64}");
    expect(query).toContain("pos_z BETWEEN {minZ:Float64} AND {maxZ:Float64}");
    expect(params).toMatchObject({
      maxX: 100,
      maxY: 50,
      maxZ: 200,
      minX: -100,
      minY: -50,
      minZ: 0,
    });
  });
});

describe("buildScenesQuery", () => {
  it("aggregates bounds per scene, filtered to spatial rows", () => {
    const { query, params } = buildScenesQuery({
      from: "2026-05-01",
      projectId: "proj_1",
      to: "2026-06-01",
    });
    expect(query).toContain("pos_x IS NOT NULL");
    expect(query).toContain("min(pos_x) AS minX");
    expect(query).toContain("max(pos_z) AS maxZ");
    expect(query).toContain("GROUP BY scene");
    expect(query).toContain("ORDER BY eventCount DESC");
    expect(params).toEqual({
      from: "2026-05-01",
      projectId: "proj_1",
      to: "2026-06-01",
    });
  });
});
