import { describe, expect, it } from "bun:test";

import type { ChClient } from "@sbox-analytics/api/ch-client";

import { InvalidApiKeyError } from "./keys";
import type { KeyResolver } from "./keys";
import { createSpatialRoutes } from "./spatial";

const VALID_KEY = "pk_live_valid";
const PROJECT_ID = "proj_1";

const fakeKeys: KeyResolver = {
  resolve(publishableKey: string): Promise<string> {
    if (publishableKey === VALID_KEY) {
      return Promise.resolve(PROJECT_ID);
    }
    return Promise.reject(new InvalidApiKeyError());
  },
};

interface Captured {
  sql: string;
  params: Record<string, unknown>;
}

const fakeCh = (rows: unknown[], captured?: Captured[]): ChClient => ({
  query(sql, params) {
    captured?.push({ params, sql });
    return Promise.resolve(rows);
  },
});

const app = (ch: ChClient) => createSpatialRoutes({ ch, keys: fakeKeys });

const VOXELS_QS = "scene=dm_arena&voxelSize=64&from=2026-06-01&to=2026-06-11";

describe("GET /voxels", () => {
  it("rejects a missing/invalid api key with 401", async () => {
    const res = await app(fakeCh([])).request(`/voxels?${VOXELS_QS}`);
    expect(res.status).toBe(401);

    const bad = await app(fakeCh([])).request(`/voxels?${VOXELS_QS}`, {
      headers: { "x-api-key": "pk_live_wrong" },
    });
    expect(bad.status).toBe(401);
  });

  it("rejects invalid params with 400", async () => {
    const cases = [
      "scene=dm_arena&voxelSize=0&from=2026-06-01&to=2026-06-11",
      "voxelSize=64&from=2026-06-01&to=2026-06-11",
      "scene=dm_arena&voxelSize=64&from=nope&to=2026-06-11",
      // metricKey without metricAgg
      `${VOXELS_QS}&metricKey=damage`,
    ];
    for (const qs of cases) {
      const res = await app(fakeCh([])).request(`/voxels?${qs}`, {
        headers: { "x-api-key": VALID_KEY },
      });
      expect(res.status).toBe(400);
    }
  });

  it("resolves the project from the key and wires params into the query", async () => {
    const captured: Captured[] = [];
    const res = await app(fakeCh([], captured)).request(
      `/voxels?${VOXELS_QS}&eventType=player_death&metricKey=damage&metricAgg=avg`,
      { headers: { "x-api-key": VALID_KEY } }
    );
    expect(res.status).toBe(200);
    expect(captured).toHaveLength(1);
    // biome-ignore lint/style/noNonNullAssertion: length asserted above
    // oxlint-disable-next-line no-non-null-assertion
    const { sql, params } = captured[0]!;
    expect(params.projectId).toBe(PROJECT_ID);
    expect(params.scene).toBe("dm_arena");
    expect(params.eventType).toBe("player_death");
    expect(params.metricKey).toBe("damage");
    expect(params.voxelSize).toBe(64);
    expect(sql).toContain("avg(JSONExtractFloat(properties");
  });

  it("maps grid indices to voxel centers and reports truncation", async () => {
    const rows = [
      { count: 10, gx: 0, gy: 1, gz: 2, value: null },
      { count: 5, gx: -1, gy: 0, gz: 0, value: null },
    ];
    const res = await app(fakeCh(rows)).request(
      `/voxels?${VOXELS_QS}&limit=1`,
      {
        headers: { "x-api-key": VALID_KEY },
      }
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      truncated: boolean;
      voxelSize: number;
      voxels: {
        x: number;
        y: number;
        z: number;
        count: number;
        value: number | null;
      }[];
    };
    expect(body.truncated).toBe(true);
    expect(body.voxelSize).toBe(64);
    expect(body.voxels).toHaveLength(1);
    expect(body.voxels[0]).toEqual({
      count: 10,
      value: null,
      x: 32,
      y: 96,
      z: 160,
    });
  });
});

describe("GET /scenes", () => {
  it("rejects an invalid key with 401", async () => {
    const res = await app(fakeCh([])).request(
      "/scenes?from=2026-06-01&to=2026-06-11"
    );
    expect(res.status).toBe(401);
  });

  it("returns the scene list with bounds", async () => {
    const rows = [
      {
        eventCount: 42,
        maxX: 100,
        maxY: 200,
        maxZ: 300,
        minX: -100,
        minY: -200,
        minZ: -300,
        scene: "dm_arena",
      },
    ];
    const res = await app(fakeCh(rows)).request(
      "/scenes?from=2026-06-01&to=2026-06-11",
      { headers: { "x-api-key": VALID_KEY } }
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { scenes: unknown[] };
    expect(body.scenes).toEqual([
      {
        bounds: {
          maxX: 100,
          maxY: 200,
          maxZ: 300,
          minX: -100,
          minY: -200,
          minZ: -300,
        },
        eventCount: 42,
        scene: "dm_arena",
      },
    ]);
  });
});
