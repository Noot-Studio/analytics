import { z } from "zod";

import { assertProjectAccess } from "../access";
import { protectedProcedure } from "../index";
import { runQuery } from "../run-query";

// Bounded sample of recent events scanned for property keys.
const PROPERTY_KEY_SAMPLE = 1000;

const eventTypesInput = z.object({
  projectId: z.string().min(1),
});

const propertyKeysInput = z.object({
  eventType: z.string().min(1),
  projectId: z.string().min(1),
});

export const introspectionRouter = {
  // Distinct event types seen for a project (from the cheap daily rollup).
  eventTypes: protectedProcedure
    .input(eventTypesInput)
    .handler(async ({ context, input }) => {
      await assertProjectAccess(input.projectId, context.session.user.id);

      const rows = await runQuery(
        context.ch,
        {
          params: { projectId: input.projectId },
          query: `
          SELECT DISTINCT event_type
          FROM analytics.events_daily
          WHERE project_id = {projectId:String}
          ORDER BY event_type
        `,
        },
        z.object({ event_type: z.string() })
      );
      return rows.map((row) => row.event_type);
    }),

  // Property keys observed on recent events of one type (bounded sample).
  propertyKeys: protectedProcedure
    .input(propertyKeysInput)
    .handler(async ({ context, input }) => {
      await assertProjectAccess(input.projectId, context.session.user.id);

      const rows = await runQuery(
        context.ch,
        {
          params: {
            eventType: input.eventType,
            projectId: input.projectId,
            sampleSize: PROPERTY_KEY_SAMPLE,
          },
          query: `
          SELECT DISTINCT arrayJoin(JSONExtractKeys(properties)) AS key
          FROM (
            SELECT properties
            FROM analytics.events
            WHERE project_id = {projectId:String}
              AND event_type = {eventType:String}
            ORDER BY timestamp DESC
            LIMIT {sampleSize:UInt32}
          )
          ORDER BY key
        `,
        },
        z.object({ key: z.string() })
      );
      return rows.map((row) => row.key);
    }),
};
