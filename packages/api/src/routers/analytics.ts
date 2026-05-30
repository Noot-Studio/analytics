import { ORPCError } from "@orpc/server";
import prisma from "@sbox-analytics/db";
import { z } from "zod";

import { clickhouse } from "../clickhouse";
import { protectedProcedure } from "../index";

const dailyInput = z.object({
  from: z.iso.date(),
  projectId: z.string().min(1),
  to: z.iso.date(),
});

const dailyRow = z.object({
  event_count: z.coerce.number(),
  event_date: z.string(),
  event_type: z.string(),
  unique_players: z.coerce.number(),
  unique_sessions: z.coerce.number(),
});

const eventsRow = z.object({
  event_count: z.coerce.number(),
  event_type: z.string(),
  unique_players: z.coerce.number(),
});

async function assertProjectAccess(
  projectId: string,
  userId: string
): Promise<void> {
  const project = await prisma.project.findFirst({
    select: { organizationId: true },
    where: { id: projectId },
  });

  if (!project) {
    throw new ORPCError("FORBIDDEN", { message: "Project not found" });
  }

  const membership = await prisma.member.findFirst({
    select: { id: true },
    where: {
      organizationId: project.organizationId,
      userId,
    },
  });

  if (!membership) {
    throw new ORPCError("FORBIDDEN", { message: "Project not accessible" });
  }
}

export const analyticsRouter = {
  // Daily rollup powered by the AggregatingMergeTree in ClickHouse.
  daily: protectedProcedure
    .input(dailyInput)
    .handler(async ({ context, input }) => {
      await assertProjectAccess(input.projectId, context.session.user.id);

      const result = await clickhouse().query({
        format: "JSON",
        query: `
          SELECT
            event_date                       AS event_date,
            event_type                        AS event_type,
            toUInt64(uniqMerge(unique_players))  AS unique_players,
            toUInt64(uniqMerge(unique_sessions)) AS unique_sessions,
            toUInt64(countMerge(event_count))    AS event_count
          FROM analytics.events_daily
          WHERE project_id = {projectId:String}
            AND event_date BETWEEN {from:Date} AND {to:Date}
          GROUP BY event_date, event_type
          ORDER BY event_date, event_type
        `,
        query_params: input,
      });

      const json = await result.json<z.infer<typeof dailyRow>>();
      return z.array(dailyRow).parse(json.data);
    }),

  // Aggregated event-type totals over a date window — backs the Events table.
  breakdown: protectedProcedure
    .input(dailyInput)
    .handler(async ({ context, input }) => {
      await assertProjectAccess(input.projectId, context.session.user.id);

      const result = await clickhouse().query({
        format: "JSON",
        query: `
          SELECT
            event_type                           AS event_type,
            toUInt64(countMerge(event_count))    AS event_count,
            toUInt64(uniqMerge(unique_players))  AS unique_players
          FROM analytics.events_daily
          WHERE project_id = {projectId:String}
            AND event_date BETWEEN {from:Date} AND {to:Date}
          GROUP BY event_type
          ORDER BY event_count DESC
        `,
        query_params: input,
      });

      const json = await result.json<z.infer<typeof eventsRow>>();
      return z.array(eventsRow).parse(json.data);
    }),

  // Most recent raw events — for the dashboard's live stream view.
  recent: protectedProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(200).default(50),
        projectId: z.string().min(1),
      })
    )
    .handler(async ({ context, input }) => {
      await assertProjectAccess(input.projectId, context.session.user.id);

      const result = await clickhouse().query({
        format: "JSON",
        query: `
          SELECT
            event_type,
            toString(timestamp) AS timestamp,
            session_id,
            player_id,
            properties
          FROM analytics.events
          WHERE project_id = {projectId:String}
          ORDER BY timestamp DESC
          LIMIT {limit:UInt32}
        `,
        query_params: input,
      });

      const json = await result.json<{
        event_type: string;
        timestamp: string;
        session_id: string;
        player_id: string;
        properties: string;
      }>();
      return json.data;
    }),
};
