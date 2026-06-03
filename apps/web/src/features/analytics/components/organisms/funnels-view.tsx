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
import { IconFilter } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  Bar,
  BarChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { orpc } from "@/utils/orpc";

import { useAnalyticsFilters } from "../../lib/use-analytics-filters";
import { FunnelBuilder } from "../molecules/funnel-builder";
import { TimeRangeFilter } from "../molecules/time-range-filter";

const MIN_FUNNEL_STEPS = 2;
const PERCENT = 100;
const CHART_HEIGHT = 240;
const CATEGORY_AXIS_WIDTH = 140;

const pct = (value: number, total: number): number =>
  total > 0 ? Math.round((value / total) * PERCENT) : 0;

export const FunnelsView = ({ projectId }: { projectId: string }) => {
  const [steps, setSteps] = useState<string[]>([]);
  const { from, to } = useAnalyticsFilters();
  const window = { from: from.slice(0, 10), to: to.slice(0, 10) };

  const typesQuery = useQuery(
    orpc.insights.breakdown.queryOptions({
      input: { ...window, projectId },
    })
  );

  const funnelReady = steps.length >= MIN_FUNNEL_STEPS;
  const funnelQuery = useQuery({
    ...orpc.insights.funnels.queryOptions({
      input: { ...window, projectId, steps },
    }),
    enabled: funnelReady,
  });

  const availableEventTypes = (typesQuery.data ?? []).map(
    (row) => row.event_type
  );

  const funnel = funnelQuery.data;
  const entryCount = funnel?.steps.at(0)?.reached ?? 0;

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="font-semibold text-2xl">Funnels</h1>
          <p className="text-muted-foreground text-sm">
            Build a step sequence to see where players drop off over the
            selected range.
          </p>
        </div>
        <TimeRangeFilter />
      </div>

      <FunnelBuilder
        availableEventTypes={availableEventTypes}
        onStepsChange={setSteps}
        steps={steps}
      />

      {funnelReady ? null : (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <IconFilter />
            </EmptyMedia>
            <EmptyTitle>Add at least two steps</EmptyTitle>
            <EmptyDescription>
              Pick the events that make up your funnel to see conversion.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {funnelReady && funnelQuery.isLoading ? (
        <Skeleton className="h-64" />
      ) : null}

      {funnelReady && funnelQuery.isError ? (
        <div className="text-destructive">Failed to load funnel.</div>
      ) : null}

      {funnel ? (
        <>
          <div className="rounded-lg border border-border p-4">
            <h2 className="mb-4 font-medium text-sm">Players per step</h2>
            <ResponsiveContainer height={CHART_HEIGHT} width="100%">
              <BarChart data={funnel.steps} layout="vertical">
                <XAxis fontSize={12} tickLine={false} type="number" />
                <YAxis
                  dataKey="event_type"
                  fontSize={12}
                  tickLine={false}
                  type="category"
                  width={CATEGORY_AXIS_WIDTH}
                />
                <Tooltip />
                <Bar dataKey="reached" fill="var(--primary)" name="Players" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="rounded-lg border border-border p-4">
            <h2 className="mb-4 font-medium text-sm">Step conversion</h2>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Step</TableHead>
                  <TableHead className="text-right">Players</TableHead>
                  <TableHead className="text-right">From previous</TableHead>
                  <TableHead className="text-right">From start</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {funnel.steps.map((step, index) => {
                  const previousReached =
                    index === 0
                      ? step.reached
                      : funnel.steps[index - 1].reached;
                  return (
                    <TableRow key={`${step.event_type}-${step.step}`}>
                      <TableCell>
                        {index + 1}. {step.event_type}
                      </TableCell>
                      <TableCell className="text-right">
                        {step.reached}
                      </TableCell>
                      <TableCell className="text-right">
                        {pct(step.reached, previousReached)}%
                      </TableCell>
                      <TableCell className="text-right">
                        {pct(step.reached, entryCount)}%
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {funnel.trend.length > 0 ? (
            <div className="rounded-lg border border-border p-4">
              <h2 className="mb-4 font-medium text-sm">Conversion over time</h2>
              <ResponsiveContainer height={CHART_HEIGHT} width="100%">
                <LineChart
                  data={funnel.trend.map((row) => ({
                    conversion: pct(row.completed, row.started),
                    day: row.day,
                  }))}
                >
                  <XAxis dataKey="day" fontSize={12} tickLine={false} />
                  <YAxis fontSize={12} tickLine={false} unit="%" />
                  <Tooltip formatter={(value) => `${value}%`} />
                  <Line
                    dataKey="conversion"
                    dot={false}
                    name="Conversion"
                    stroke="var(--primary)"
                    type="monotone"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
};
