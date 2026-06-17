// Splits an incoming batch into the three destinations the pipeline now has:
// ordinary events (-> `events` topic / analytics.events) and the two fanned-out
// spatial streams (-> `spatial_cells` / `trajectory`). Pure so the routing and
// row counts are unit-testable without booting the server; index.ts maps the
// thrown BatchError onto an HTTP status.

import type {
  ClickHouseEvent,
  ExpandedBatch,
  IncomingEvent,
  SpatialCellRow,
  TrajectoryPointRow,
} from "@sbox-analytics/events";
import {
  expandSpatialBatch,
  isSpatialEventType,
  SpatialBatchError,
  toClickHouseEvent,
} from "@sbox-analytics/events";

export class BatchError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "BatchError";
    this.status = status;
  }
}

export interface PartitionedBatch {
  normal: ClickHouseEvent[];
  cells: SpatialCellRow[];
  points: TrajectoryPointRow[];
}

/** Total rows this batch will produce across all topics (quota unit). */
export const partitionedSize = (batch: PartitionedBatch): number =>
  batch.normal.length + batch.cells.length + batch.points.length;

export const partitionBatch = (
  events: IncomingEvent[],
  projectId: string,
  maxPropertiesBytes: number,
  now?: Date
): PartitionedBatch => {
  const normal: ClickHouseEvent[] = [];
  const cells: SpatialCellRow[] = [];
  const points: TrajectoryPointRow[] = [];

  for (const ev of events) {
    if (isSpatialEventType(ev.type)) {
      let expanded: ExpandedBatch;
      try {
        expanded = expandSpatialBatch(ev, projectId, now);
      } catch (error) {
        if (error instanceof SpatialBatchError) {
          throw new BatchError(400, error.message);
        }
        throw error;
      }
      for (const cell of expanded.cells) {
        cells.push(cell);
      }
      for (const point of expanded.points) {
        points.push(point);
      }
      continue;
    }

    const properties = ev.properties ? JSON.stringify(ev.properties) : "{}";
    if (properties.length > maxPropertiesBytes) {
      throw new BatchError(400, "properties too large");
    }
    normal.push(toClickHouseEvent(ev, projectId, properties));
  }

  return { cells, normal, points };
};
