import { describe, expect, it } from "bun:test";

import type { IncomingEvent } from "./incoming";
import {
  expandSpatialBatch,
  isSpatialEventType,
  SpatialBatchError,
} from "./spatial";

const NOW = new Date("2026-06-17T12:30:00.000Z");

const base = {
  player_id: "anon_1",
  scene: "de_dust2",
  session_id: "sess_1",
  timestamp: new Date("2026-06-17T08:00:00.000Z"),
} satisfies Partial<IncomingEvent>;

const event = (over: Partial<IncomingEvent>): IncomingEvent =>
  ({ ...base, type: "custom_event", ...over }) as IncomingEvent;

describe("isSpatialEventType", () => {
  it("matches the two spatial types only", () => {
    expect(isSpatialEventType("spatial_cells")).toBe(true);
    expect(isSpatialEventType("trajectory")).toBe(true);
    expect(isSpatialEventType("dwell_cells")).toBe(false);
    expect(isSpatialEventType("session_start")).toBe(false);
    expect(isSpatialEventType("player_death")).toBe(false);
  });
});

describe("expandSpatialBatch — cells", () => {
  it("fans spatial_cells into per-cell rows (kind from props, hits=1, day from ts)", () => {
    const { cells, points } = expandSpatialBatch(
      event({
        properties: {
          cell_size: 128,
          cells: [
            [1, 2, 3, 400],
            [-1, 0, 5, 1500],
          ],
          kind: "dwell",
        },
        type: "spatial_cells",
      }),
      "proj_1",
      NOW
    );

    expect(points).toHaveLength(0);
    expect(cells).toEqual([
      {
        cell_size: 128,
        day: "2026-06-17",
        gx: 1,
        gy: 2,
        gz: 3,
        hits: 1,
        kind: "dwell",
        project_id: "proj_1",
        scene: "de_dust2",
        value: 400,
      },
      {
        cell_size: 128,
        day: "2026-06-17",
        gx: -1,
        gy: 0,
        gz: 5,
        hits: 1,
        kind: "dwell",
        project_id: "proj_1",
        scene: "de_dust2",
        value: 1500,
      },
    ]);
  });

  it("carries an arbitrary game-defined kind through unchanged", () => {
    const { cells } = expandSpatialBatch(
      event({
        properties: { cell_size: 64, cells: [[0, 0, 0, 7]], kind: "damage" },
        type: "spatial_cells",
      }),
      "proj_1",
      NOW
    );
    expect(cells[0]?.kind).toBe("damage");
    expect(cells[0]?.value).toBe(7);
  });

  it("truncates non-integer grid indices to keep the Int32 key sound", () => {
    const { cells } = expandSpatialBatch(
      event({
        properties: {
          cell_size: 32,
          cells: [[1.9, -2.9, 3.1, 10]],
          kind: "visits",
        },
        type: "spatial_cells",
      }),
      "proj_1",
      NOW
    );
    expect(cells[0]).toMatchObject({ gx: 1, gy: -2, gz: 3 });
  });

  it("falls back to `now` for the day when the event has no timestamp", () => {
    const { cells } = expandSpatialBatch(
      event({
        properties: { cell_size: 32, cells: [[0, 0, 0, 1]], kind: "dwell" },
        timestamp: undefined,
        type: "spatial_cells",
      }),
      "proj_1",
      NOW
    );
    expect(cells[0]?.day).toBe("2026-06-17");
  });

  it("throws SpatialBatchError when kind is missing", () => {
    expect(() =>
      expandSpatialBatch(
        event({
          properties: { cell_size: 32, cells: [[0, 0, 0, 1]] },
          type: "spatial_cells",
        }),
        "proj_1",
        NOW
      )
    ).toThrow(SpatialBatchError);
  });

  it("throws SpatialBatchError on malformed cells properties", () => {
    expect(() =>
      expandSpatialBatch(
        event({
          properties: { cells: "nope", kind: "dwell" },
          type: "spatial_cells",
        }),
        "proj_1",
        NOW
      )
    ).toThrow(SpatialBatchError);
  });
});

describe("expandSpatialBatch — trajectory", () => {
  it("fans points into ordered rows with seq and per-point timestamp", () => {
    const t0 = Date.UTC(2026, 5, 17, 8, 0, 0);
    const { cells, points } = expandSpatialBatch(
      event({
        properties: {
          points: [
            [10, 20, 30, t0],
            [11, 21, 31, t0 + 500],
          ],
        },
        type: "trajectory",
      }),
      "proj_1",
      NOW
    );

    expect(cells).toHaveLength(0);
    expect(points).toHaveLength(2);
    expect(points[0]).toEqual({
      player_id: "anon_1",
      pos_x: 10,
      pos_y: 20,
      pos_z: 30,
      project_id: "proj_1",
      scene: "de_dust2",
      seq: 0,
      session_id: "sess_1",
      timestamp: "2026-06-17 08:00:00.000",
    });
    expect(points[1]?.seq).toBe(1);
    expect(points[1]?.timestamp).toBe("2026-06-17 08:00:00.500");
  });

  it("throws SpatialBatchError on malformed trajectory properties", () => {
    expect(() =>
      expandSpatialBatch(
        event({ properties: { points: [[1, 2]] }, type: "trajectory" }),
        "proj_1",
        NOW
      )
    ).toThrow(SpatialBatchError);
  });
});

describe("expandSpatialBatch — guard", () => {
  it("throws on a non-spatial event type", () => {
    expect(() =>
      expandSpatialBatch(event({ type: "session_start" }), "proj_1", NOW)
    ).toThrow(SpatialBatchError);
  });
});
