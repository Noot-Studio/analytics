import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@sbox-analytics/ui/components/empty";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@sbox-analytics/ui/components/select";
import { useQuery } from "@tanstack/react-query";
import { ChartNoAxesColumn } from "lucide-react";
import { useState } from "react";

import { TableSkeleton } from "@/components/table-skeleton";
import { orpc } from "@/utils/orpc";

import { isoDaysAgo } from "../../lib/date-window";
import { EventsTable } from "../molecules/events-table";

const WINDOWS = [
  { days: 7, label: "Last 7 days", value: "7" },
  { days: 30, label: "Last 30 days", value: "30" },
  { days: 90, label: "Last 90 days", value: "90" },
];

export const EventsView = ({ projectId }: { projectId: string }) => {
  const [windowValue, setWindowValue] = useState("30");
  const days = WINDOWS.find((entry) => entry.value === windowValue)?.days ?? 30;

  const query = useQuery(
    orpc.analytics.events.queryOptions({
      input: { from: isoDaysAgo(days), projectId, to: isoDaysAgo(0) },
    })
  );

  const rows = query.data ?? [];

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="font-semibold text-2xl">Events</h1>
          <p className="text-muted-foreground">Event totals by type.</p>
        </div>
        <Select
          onValueChange={(value) => {
            if (value) {
              setWindowValue(value);
            }
          }}
          value={windowValue}
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {WINDOWS.map((entry) => (
              <SelectItem key={entry.value} value={entry.value}>
                {entry.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {query.isLoading ? <TableSkeleton rows={8} /> : null}
      {query.isError ? (
        <div className="text-destructive">Failed to load events.</div>
      ) : null}
      {!query.isLoading && !query.isError && rows.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ChartNoAxesColumn />
            </EmptyMedia>
            <EmptyTitle>No events in this window</EmptyTitle>
            <EmptyDescription>
              Try a wider time range, or connect your s&box SDK to start sending
              events.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}
      {rows.length > 0 ? <EventsTable rows={rows} /> : null}
    </div>
  );
};
