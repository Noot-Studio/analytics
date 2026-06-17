import { describe, expect, it } from "bun:test";

import type { IncomingEvent } from "@sbox-analytics/events";

import { BatchError, partitionBatch, partitionedSize } from "./fanout";

const PROJECT = "proj_1";
const CAP = 16 * 1024;
const NOW = new Date("2026-06-17T12:00:00.000Z");

const ev = (over: Partial<IncomingEvent>): IncomingEvent =>
  ({
    player_id: "anon_1",
    scene: "de_dust2",
    session_id: "sess_1",
    type: "custom_event",
    ...over,
  }) as IncomingEvent;

describe("partitionBatch", () => {
  it("routes ordinary events to `normal` and maps them to rows", () => {
    const batch = partitionBatch(
      [ev({ properties: { weapon: "ak47" }, type: "player_death" })],
      PROJECT,
      CAP,
      NOW
    );
    expect(batch.cells).toHaveLength(0);
    expect(batch.points).toHaveLength(0);
    expect(batch.normal).toHaveLength(1);
    expect(batch.normal[0]).toMatchObject({
      event_type: "player_death",
      project_id: PROJECT,
      properties: '{"weapon":"ak47"}',
    });
  });

  it("fans spatial_cells (any kind) into cell rows, keeping normal events", () => {
    const batch = partitionBatch(
      [
        ev({ properties: undefined, type: "session_start" }),
        ev({
          properties: {
            cell_size: 128,
            cells: [
              [0, 0, 0, 500],
              [1, 0, 2, 250],
            ],
            kind: "dwell",
          },
          type: "spatial_cells",
        }),
        ev({
          properties: { cell_size: 128, cells: [[3, 3, 3, 4]], kind: "damage" },
          type: "spatial_cells",
        }),
      ],
      PROJECT,
      CAP,
      NOW
    );
    expect(batch.normal).toHaveLength(1);
    expect(batch.cells).toHaveLength(3);
    expect(batch.cells.filter((c) => c.kind === "dwell")).toHaveLength(2);
    expect(batch.cells.filter((c) => c.kind === "damage")).toHaveLength(1);
    expect(batch.points).toHaveLength(0);
  });

  it("fans trajectory events into ordered point rows", () => {
    const t0 = Date.UTC(2026, 5, 17, 8, 0, 0);
    const batch = partitionBatch(
      [
        ev({
          properties: {
            points: [
              [1, 2, 3, t0],
              [4, 5, 6, t0 + 100],
            ],
          },
          type: "trajectory",
        }),
      ],
      PROJECT,
      CAP,
      NOW
    );
    expect(batch.points).toHaveLength(2);
    expect(batch.points.map((p) => p.seq)).toEqual([0, 1]);
    expect(batch.normal).toHaveLength(0);
  });

  it("throws BatchError(400) when ordinary-event properties exceed the cap", () => {
    const big = { blob: "x".repeat(20) };
    expect(() =>
      partitionBatch([ev({ properties: big })], PROJECT, 8, NOW)
    ).toThrow(BatchError);
  });

  it("throws BatchError(400) on a malformed spatial batch", () => {
    let thrown: unknown;
    try {
      partitionBatch(
        [
          ev({
            properties: { cells: "nope", kind: "dwell" },
            type: "spatial_cells",
          }),
        ],
        PROJECT,
        CAP,
        NOW
      );
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(BatchError);
    expect((thrown as BatchError).status).toBe(400);
  });
});

describe("partitionedSize", () => {
  it("counts every row across all three destinations", () => {
    const batch = partitionBatch(
      [
        ev({ properties: undefined, type: "session_start" }),
        ev({
          properties: { cell_size: 64, cells: [[0, 0, 0, 1]], kind: "dwell" },
          type: "spatial_cells",
        }),
        ev({ properties: { points: [[0, 0, 0, 1]] }, type: "trajectory" }),
      ],
      PROJECT,
      CAP,
      NOW
    );
    expect(partitionedSize(batch)).toBe(3);
  });
});
