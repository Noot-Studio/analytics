import { Button } from "@sbox-analytics/ui/components/button";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { orpc } from "@/utils/orpc";

import { LiveEventsTable } from "../molecules/live-events-table";

const POLL_INTERVAL_MS = 5000;
const LIVE_EVENT_LIMIT = 50;

export const LiveEventsView = ({ projectId }: { projectId: string }) => {
  const [paused, setPaused] = useState(false);

  const query = useQuery({
    ...orpc.analytics.recent.queryOptions({
      input: { limit: LIVE_EVENT_LIMIT, projectId },
    }),
    refetchInterval: paused ? false : POLL_INTERVAL_MS,
  });

  const rows = query.data ?? [];

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="font-semibold text-2xl">Live Events</h1>
          <p className="text-muted-foreground">
            Recent raw events, refreshed every {POLL_INTERVAL_MS / 1000}s.
          </p>
        </div>
        <Button onClick={() => setPaused((value) => !value)} variant="outline">
          {paused ? "Resume" : "Pause"}
        </Button>
      </div>

      {query.isLoading ? <div>Loading events…</div> : null}
      {query.isError ? (
        <div className="text-destructive">Failed to load live events.</div>
      ) : null}
      {!query.isLoading && !query.isError && rows.length === 0 ? (
        <div className="rounded-lg border border-border border-dashed p-8 text-center text-muted-foreground">
          No events yet — connect your SDK.
        </div>
      ) : null}
      {rows.length > 0 ? <LiveEventsTable rows={rows} /> : null}
    </div>
  );
};
