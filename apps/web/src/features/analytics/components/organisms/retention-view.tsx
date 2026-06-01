import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@sbox-analytics/ui/components/empty";
import { Skeleton } from "@sbox-analytics/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@sbox-analytics/ui/components/table";
import { IconUsersGroup } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { orpc } from "@/utils/orpc";

import { isoDaysAgo } from "../../lib/date-window";
import { MetricCard } from "../molecules/metric-card";

const RETENTION_WINDOW_DAYS = 90;
const PERCENT = 100;
const CHART_HEIGHT = 240;

const pct = (value: number, total: number): number =>
  total > 0 ? Math.round((value / total) * PERCENT) : 0;

export const RetentionView = ({ projectId }: { projectId: string }) => {
  const query = useQuery(
    orpc.insights.retention.queryOptions({
      input: {
        from: isoDaysAgo(RETENTION_WINDOW_DAYS),
        projectId,
        to: isoDaysAgo(0),
      },
    })
  );

  if (query.isLoading) {
    return (
      <div className="flex flex-col gap-6 p-4 lg:p-6">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-28" />
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="p-4 text-destructive lg:p-6">
        Failed to load retention.
      </div>
    );
  }

  const { data } = query;
  if (!data) {
    return null;
  }

  const base = data.curve.find((row) => row.day_offset === 0)?.retained ?? 0;
  const retainedAt = (offset: number): number =>
    data.curve.find((row) => row.day_offset === offset)?.retained ?? 0;

  const curve = data.curve.map((row) => ({
    day: row.day_offset,
    retention: pct(row.retained, base),
  }));

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-semibold text-2xl">Retention</h1>
        <p className="text-muted-foreground text-sm">
          Cohort retention over the last {RETENTION_WINDOW_DAYS} days.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard
          label="Day-1 retention"
          value={`${pct(retainedAt(1), base)}%`}
        />
        <MetricCard
          label="Day-7 retention"
          value={`${pct(retainedAt(7), base)}%`}
        />
        <MetricCard
          label="Day-30 retention"
          value={`${pct(retainedAt(30), base)}%`}
        />
      </div>

      {curve.length > 0 ? (
        <div className="rounded-lg border border-border p-4">
          <h2 className="mb-4 font-medium text-sm">
            Average retention curve (mature cohorts)
          </h2>
          <ResponsiveContainer height={CHART_HEIGHT} width="100%">
            <LineChart data={curve}>
              <XAxis dataKey="day" fontSize={12} tickLine={false} />
              <YAxis fontSize={12} tickLine={false} unit="%" />
              <Tooltip formatter={(value) => `${value}%`} />
              <Line
                dataKey="retention"
                dot={false}
                name="Retention"
                stroke="var(--primary)"
                type="monotone"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : null}

      {data.cohorts.length > 0 ? (
        <div className="rounded-lg border border-border p-4">
          <h2 className="mb-4 font-medium text-sm">Cohorts</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cohort</TableHead>
                <TableHead className="text-right">Players</TableHead>
                <TableHead className="text-right">Day 1</TableHead>
                <TableHead className="text-right">Day 7</TableHead>
                <TableHead className="text-right">Day 30</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.cohorts.map((cohort) => (
                <TableRow key={cohort.cohort_date}>
                  <TableCell>{cohort.cohort_date}</TableCell>
                  <TableCell className="text-right">{cohort.size}</TableCell>
                  <TableCell className="text-right">
                    {pct(cohort.d1, cohort.size)}%
                  </TableCell>
                  <TableCell className="text-right">
                    {pct(cohort.d7, cohort.size)}%
                  </TableCell>
                  <TableCell className="text-right">
                    {pct(cohort.d30, cohort.size)}%
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <IconUsersGroup />
            </EmptyMedia>
            <EmptyTitle>No cohorts yet</EmptyTitle>
            <EmptyDescription>
              Retention appears once players return across multiple days.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  );
};
