import { useQuery } from "@tanstack/react-query";

import { orpc } from "@/utils/orpc";

// Shown when the active organization has exhausted its monthly cloud event
// quota: ingest is dropping events until the month resets or the limit is
// raised. Renders nothing on self-hosted deployments (billing disabled) and
// while under quota.
export const UsageBanner = () => {
  const usageQuery = useQuery(orpc.usage.current.queryOptions());

  const usage = usageQuery.data;
  if (!usage?.billingEnabled || usage.limit === null) {
    return null;
  }
  if (usage.used < usage.limit) {
    return null;
  }

  return (
    <output className="border-destructive/30 bg-destructive/10 text-destructive block border-b px-4 py-2 text-sm">
      Monthly event limit reached ({usage.limit.toLocaleString()} events) — new
      events are being dropped until next month. Contact us for a custom plan
      with higher limits.
    </output>
  );
};
