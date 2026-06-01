// Pure ClickHouse query builders for spatial (voxel) analytics.
// No DB/network access — fully unit-testable. The router layer feeds the
// returned { query, params } straight into clickhouse().query({ query_params: params }).

const AGG_FUNCTIONS = {
  avg: "avg",
  max: "max",
  min: "min",
  sum: "sum",
} as const;

export type VoxelAgg = keyof typeof AGG_FUNCTIONS;

export interface VoxelBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

export interface VoxelsInput {
  projectId: string;
  scene: string;
  eventType?: string;
  voxelSize: number;
  from: string;
  to: string;
  metric?: { key: string; agg: VoxelAgg };
  bounds?: VoxelBounds;
  limit: number;
}

export interface ScenesInput {
  projectId: string;
  from: string;
  to: string;
}

export interface BuiltQuery {
  query: string;
  params: Record<string, unknown>;
}

/** World-space center of voxel grid index `g` for a cube edge of `voxelSize`. */
export function voxelCenter(g: number, voxelSize: number): number {
  return (g + 0.5) * voxelSize;
}

export function buildVoxelsQuery(input: VoxelsInput): BuiltQuery {
  const params: Record<string, unknown> = {
    from: input.from,
    limitPlusOne: input.limit + 1,
    projectId: input.projectId,
    scene: input.scene,
    to: input.to,
    voxelSize: input.voxelSize,
  };

  const where = [
    "project_id = {projectId:String}",
    "scene = {scene:String}",
    "pos_x IS NOT NULL",
    "toDate(timestamp) BETWEEN {from:Date} AND {to:Date}",
  ];

  if (input.eventType) {
    where.push("event_type = {eventType:String}");
    params.eventType = input.eventType;
  }

  if (input.bounds) {
    where.push("pos_x BETWEEN {minX:Float64} AND {maxX:Float64}");
    where.push("pos_y BETWEEN {minY:Float64} AND {maxY:Float64}");
    where.push("pos_z BETWEEN {minZ:Float64} AND {maxZ:Float64}");
    Object.assign(params, input.bounds);
  }

  let valueExpr = "NULL";
  if (input.metric) {
    const fn = AGG_FUNCTIONS[input.metric.agg];
    if (!fn) {
      throw new Error(`Unsupported aggregation: ${input.metric.agg}`);
    }
    valueExpr = `${fn}(JSONExtractFloat(properties, {metricKey:String}))`;
    params.metricKey = input.metric.key;
  }

  const query = `
    SELECT
      floor(pos_x / {voxelSize:Float64}) AS gx,
      floor(pos_y / {voxelSize:Float64}) AS gy,
      floor(pos_z / {voxelSize:Float64}) AS gz,
      count() AS count,
      ${valueExpr} AS value
    FROM analytics.events
    WHERE ${where.join("\n      AND ")}
    GROUP BY gx, gy, gz
    ORDER BY count DESC
    LIMIT {limitPlusOne:UInt32}
  `;

  return { params, query };
}

export function buildScenesQuery(input: ScenesInput): BuiltQuery {
  const params: Record<string, unknown> = {
    from: input.from,
    projectId: input.projectId,
    to: input.to,
  };

  const query = `
    SELECT
      scene,
      count() AS eventCount,
      min(pos_x) AS minX,
      max(pos_x) AS maxX,
      min(pos_y) AS minY,
      max(pos_y) AS maxY,
      min(pos_z) AS minZ,
      max(pos_z) AS maxZ
    FROM analytics.events
    WHERE project_id = {projectId:String}
      AND pos_x IS NOT NULL
      AND toDate(timestamp) BETWEEN {from:Date} AND {to:Date}
    GROUP BY scene
    ORDER BY eventCount DESC
  `;

  return { params, query };
}
