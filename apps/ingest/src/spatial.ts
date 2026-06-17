import type { ChClient } from "@sbox-analytics/api/ch-client";
import { runQuery } from "@sbox-analytics/api/run-query";
import {
  buildScenesQuery,
  buildVoxelsQuery,
  voxelCenter,
} from "@sbox-analytics/api/spatial-query";
import {
  buildHeatmapQuery,
  buildTrajectoryQuery,
} from "@sbox-analytics/api/spatial-rollup-query";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";

import type { KeyResolver } from "./keys";
import { InvalidApiKeyError } from "./keys";

// Read endpoints for the SDK editor heatmap tool. Mirrors the oRPC
// spatial.voxels / spatial.scenes routes, but the project is resolved from the
// x-api-key header instead of a session-scoped projectId. The header carries
// the SECRET key (sk_) — the publishable key ships in game builds and is
// write-only; wire the secret-key resolver here, never the publishable one.

const MAX_VOXELS = 50_000;
const MAX_POINTS = 100_000;

const voxelsParams = z
  .object({
    eventType: z.string().min(1).optional(),
    from: z.iso.date(),
    limit: z.coerce
      .number()
      .int()
      .positive()
      .max(MAX_VOXELS)
      .default(MAX_VOXELS),
    metricAgg: z.enum(["avg", "min", "max", "sum"]).optional(),
    metricKey: z.string().min(1).optional(),
    scene: z.string().min(1),
    to: z.iso.date(),
    voxelSize: z.coerce.number().positive(),
  })
  .refine((p) => p.metricKey === undefined || p.metricAgg !== undefined, {
    message: "metricAgg is required when metricKey is set",
  });

const scenesParams = z.object({
  from: z.iso.date(),
  to: z.iso.date(),
});

const voxelRow = z.object({
  count: z.coerce.number(),
  gx: z.coerce.number(),
  gy: z.coerce.number(),
  gz: z.coerce.number(),
  value: z.coerce.number().nullable(),
});

const sceneRow = z.object({
  eventCount: z.coerce.number(),
  maxX: z.coerce.number(),
  maxY: z.coerce.number(),
  maxZ: z.coerce.number(),
  minX: z.coerce.number(),
  minY: z.coerce.number(),
  minZ: z.coerce.number(),
  scene: z.string(),
});

const heatmapParams = z
  .object({
    cellSize: z.coerce.number().positive(),
    from: z.iso.date(),
    kind: z.string().min(1),
    limit: z.coerce
      .number()
      .int()
      .positive()
      .max(MAX_VOXELS)
      .default(MAX_VOXELS),
    scene: z.string().min(1),
    to: z.iso.date(),
    voxelSize: z.coerce.number().positive().optional(),
  })
  .refine((p) => p.voxelSize === undefined || p.voxelSize >= p.cellSize, {
    message: "voxelSize must be >= cellSize",
  });

const heatmapRow = z.object({
  gx: z.coerce.number(),
  gy: z.coerce.number(),
  gz: z.coerce.number(),
  hits: z.coerce.number(),
  value: z.coerce.number(),
});

const trajectoryParams = z.object({
  from: z.iso.date(),
  limit: z.coerce.number().int().positive().max(MAX_POINTS).default(MAX_POINTS),
  playerId: z.string().min(1),
  scene: z.string().min(1),
  sessionId: z.string().min(1).optional(),
  to: z.iso.date(),
});

const trajectoryRow = z.object({
  pos_x: z.coerce.number(),
  pos_y: z.coerce.number(),
  pos_z: z.coerce.number(),
  seq: z.coerce.number(),
  session_id: z.string(),
  timestamp: z.string(),
});

export interface SpatialRouteDeps {
  keys: KeyResolver;
  ch: ChClient;
}

const resolveProjectId = async (
  keys: KeyResolver,
  apiKey: string
): Promise<string> => {
  try {
    return await keys.resolve(apiKey);
  } catch (error) {
    if (error instanceof InvalidApiKeyError) {
      throw new HTTPException(401, { message: "invalid api key" });
    }
    throw new HTTPException(500, { message: "key lookup failed" });
  }
};

export const createSpatialRoutes = ({ keys, ch }: SpatialRouteDeps): Hono => {
  const app = new Hono();

  app.get("/voxels", async (c) => {
    const projectId = await resolveProjectId(
      keys,
      c.req.header("x-api-key") ?? ""
    );

    const parsed = voxelsParams.safeParse(c.req.query());
    if (!parsed.success) {
      throw new HTTPException(400, { message: "invalid params" });
    }
    const input = parsed.data;

    const rows = await runQuery(
      ch,
      buildVoxelsQuery({
        eventType: input.eventType,
        from: input.from,
        limit: input.limit,
        metric:
          input.metricKey !== undefined && input.metricAgg !== undefined
            ? { agg: input.metricAgg, key: input.metricKey }
            : undefined,
        projectId,
        scene: input.scene,
        to: input.to,
        voxelSize: input.voxelSize,
      }),
      voxelRow
    );

    const truncated = rows.length > input.limit;
    const voxels = rows.slice(0, input.limit).map((r) => ({
      count: r.count,
      value: r.value,
      x: voxelCenter(r.gx, input.voxelSize),
      y: voxelCenter(r.gy, input.voxelSize),
      z: voxelCenter(r.gz, input.voxelSize),
    }));

    return c.json({ truncated, voxelSize: input.voxelSize, voxels });
  });

  app.get("/scenes", async (c) => {
    const projectId = await resolveProjectId(
      keys,
      c.req.header("x-api-key") ?? ""
    );

    const parsed = scenesParams.safeParse(c.req.query());
    if (!parsed.success) {
      throw new HTTPException(400, { message: "invalid params" });
    }

    const rows = await runQuery(
      ch,
      buildScenesQuery({ projectId, ...parsed.data }),
      sceneRow
    );

    return c.json({
      scenes: rows.map((r) => ({
        bounds: {
          maxX: r.maxX,
          maxY: r.maxY,
          maxZ: r.maxZ,
          minX: r.minX,
          minY: r.minY,
          minZ: r.minZ,
        },
        eventCount: r.eventCount,
        scene: r.scene,
      })),
    });
  });

  app.get("/heatmap", async (c) => {
    const projectId = await resolveProjectId(
      keys,
      c.req.header("x-api-key") ?? ""
    );

    const parsed = heatmapParams.safeParse(c.req.query());
    if (!parsed.success) {
      throw new HTTPException(400, { message: "invalid params" });
    }
    const input = parsed.data;
    const voxelSize = input.voxelSize ?? input.cellSize;

    const rows = await runQuery(
      ch,
      buildHeatmapQuery({
        cellSize: input.cellSize,
        from: input.from,
        kind: input.kind,
        limit: input.limit,
        projectId,
        scene: input.scene,
        to: input.to,
        voxelSize: input.voxelSize,
      }),
      heatmapRow
    );

    const truncated = rows.length > input.limit;
    const cells = rows.slice(0, input.limit).map((r) => ({
      hits: r.hits,
      value: r.value,
      x: voxelCenter(r.gx, voxelSize),
      y: voxelCenter(r.gy, voxelSize),
      z: voxelCenter(r.gz, voxelSize),
    }));

    return c.json({ cells, kind: input.kind, truncated, voxelSize });
  });

  app.get("/trajectory", async (c) => {
    const projectId = await resolveProjectId(
      keys,
      c.req.header("x-api-key") ?? ""
    );

    const parsed = trajectoryParams.safeParse(c.req.query());
    if (!parsed.success) {
      throw new HTTPException(400, { message: "invalid params" });
    }
    const input = parsed.data;

    const rows = await runQuery(
      ch,
      buildTrajectoryQuery({
        from: input.from,
        limit: input.limit,
        playerId: input.playerId,
        projectId,
        scene: input.scene,
        sessionId: input.sessionId,
        to: input.to,
      }),
      trajectoryRow
    );

    const truncated = rows.length >= input.limit;
    const points = rows.map((r) => ({
      seq: r.seq,
      sessionId: r.session_id,
      t: r.timestamp,
      x: r.pos_x,
      y: r.pos_y,
      z: r.pos_z,
    }));

    return c.json({ playerId: input.playerId, points, truncated });
  });

  return app;
};
