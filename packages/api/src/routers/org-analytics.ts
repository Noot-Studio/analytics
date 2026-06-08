import prisma from "@sbox-analytics/db";
import { z } from "zod";

import { assertOrgAccess, requireActiveOrg } from "../access";
import { protectedProcedure } from "../index";
import { runQuery } from "../run-query";

const dailyInput = z.object({
  from: z.iso.date(),
  // Explicit org id keeps query caches per-org; falls back to the session's
  // active organization when omitted.
  organizationId: z.string().min(1).optional(),
  to: z.iso.date(),
});

// Same row shape as insights.daily so org and project cards share renderers.
const dailyRow = z.object({
  event_count: z.coerce.number(),
  event_date: z.string(),
  event_type: z.string(),
  unique_players: z.coerce.number(),
  unique_sessions: z.coerce.number(),
});

export const orgAnalyticsRouter = {
  // Daily rollup aggregated across every project in the active organization.
  daily: protectedProcedure
    .input(dailyInput)
    .handler(async ({ context, input }) => {
      const organizationId = input.organizationId ?? requireActiveOrg(context);
      await assertOrgAccess(organizationId, context.session.user.id);

      const projects = await prisma.project.findMany({
        select: { id: true },
        where: { organizationId },
      });
      if (projects.length === 0) {
        return [];
      }

      return runQuery(
        context.ch,
        {
          params: {
            from: input.from,
            projectIds: projects.map((project) => project.id),
            to: input.to,
          },
          query: `
          SELECT
            event_date                           AS event_date,
            event_type                           AS event_type,
            toUInt64(uniqMerge(unique_players))  AS unique_players,
            toUInt64(uniqMerge(unique_sessions)) AS unique_sessions,
            toUInt64(countMerge(event_count))    AS event_count
          FROM analytics.events_daily
          WHERE project_id IN {projectIds:Array(String)}
            AND event_date BETWEEN {from:Date} AND {to:Date}
          GROUP BY event_date, event_type
          ORDER BY event_date, event_type
        `,
        },
        dailyRow
      );
    }),
};
