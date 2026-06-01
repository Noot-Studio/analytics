import { describe, expect, it } from "bun:test";

import { batchSchema, toClickHouseEvent } from "./schema";

describe("eventSchema spatial fields", () => {
  it("accepts an event with position + scene", () => {
    const parsed = batchSchema.parse({
      events: [
        {
          position: { x: 1.5, y: -2, z: 30 },
          scene: "dm_arena",
          session_id: "sess_1",
          type: "player_death",
        },
      ],
    });
    // biome-ignore lint/style/noNonNullAssertion: array bounds guaranteed by batchSchema.min(1)
    // oxlint-disable-next-line no-non-null-assertion
    expect(parsed.events[0]!.position).toEqual({ x: 1.5, y: -2, z: 30 });
    // biome-ignore lint/style/noNonNullAssertion: array bounds guaranteed by batchSchema.min(1)
    // oxlint-disable-next-line no-non-null-assertion
    expect(parsed.events[0]!.scene).toBe("dm_arena");
  });

  it("accepts a non-spatial event (no position, scene defaults to '')", () => {
    const parsed = batchSchema.parse({
      events: [{ session_id: "sess_1", type: "level_up" }],
    });
    // biome-ignore lint/style/noNonNullAssertion: array bounds guaranteed by batchSchema.min(1)
    // oxlint-disable-next-line no-non-null-assertion
    expect(parsed.events[0]!.position).toBeUndefined();
    // biome-ignore lint/style/noNonNullAssertion: array bounds guaranteed by batchSchema.min(1)
    // oxlint-disable-next-line no-non-null-assertion
    expect(parsed.events[0]!.scene).toBe("");
  });

  it("rejects a malformed position (non-numeric coord)", () => {
    expect(() =>
      batchSchema.parse({
        events: [
          { position: { x: "nope", y: 0, z: 0 }, session_id: "s", type: "x" },
        ],
      })
    ).toThrow();
  });
});

describe("toClickHouseEvent", () => {
  it("maps a spatial event to null-free pos columns", () => {
    const row = toClickHouseEvent(
      {
        player_id: "",
        position: { x: 1, y: 2, z: 3 },
        scene: "dm_arena",
        session_id: "sess_1",
        type: "player_death",
      },
      "proj_1"
    );
    expect(row).toMatchObject({
      event_type: "player_death",
      pos_x: 1,
      pos_y: 2,
      pos_z: 3,
      project_id: "proj_1",
      scene: "dm_arena",
    });
  });

  it("maps a non-spatial event to null positions and empty scene", () => {
    const row = toClickHouseEvent(
      { player_id: "", scene: "", session_id: "s", type: "level_up" },
      "proj_1"
    );
    expect(row.pos_x).toBeNull();
    expect(row.pos_y).toBeNull();
    expect(row.pos_z).toBeNull();
    expect(row.scene).toBe("");
  });
});
