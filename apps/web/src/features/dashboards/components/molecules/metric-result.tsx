import type { ShapeParams, Visualization } from "@sbox-analytics/api/metrics";
import { resultShape } from "@sbox-analytics/api/metrics";
import { Area, Bar } from "@sbox-analytics/ui/components/chart-series";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@sbox-analytics/ui/components/table";
import {
  AreaChart,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { MetricCard } from "@/features/analytics/components/molecules/metric-card";

export type MetricRows = Record<string, unknown>[];

export const WidgetMessage = ({
  title,
  message,
}: {
  title: string;
  message: string;
}) => (
  <div className="flex h-full min-h-24 flex-col rounded-lg border border-border p-4">
    <h2 className="font-medium text-sm">{title}</h2>
    <p className="flex flex-1 items-center justify-center text-muted-foreground text-sm">
      {message}
    </p>
  </div>
);

const ChartFrame = ({
  children,
  title,
}: {
  children: React.ReactElement;
  title: string;
}) => (
  <div className="flex h-full flex-col rounded-lg border border-border p-4">
    <h2 className="mb-4 font-medium text-sm">{title}</h2>
    <div className="min-h-0 flex-1">
      <ResponsiveContainer height="100%" width="100%">
        {children}
      </ResponsiveContainer>
    </div>
  </div>
);

/**
 * One chart point per row: series rows label by time bucket, group rows by
 * their group columns. ClickHouse JSON output serializes 64-bit aggregates as
 * strings, so values are coerced.
 */
const toPoints = (view: ShapeParams, rows: MetricRows) => {
  const groupBy = view.groupBy ?? [];
  return rows.map((row) => {
    const groups = groupBy.map((_, column) =>
      String(row[`group_col_${column}`] ?? "")
    );
    const bucket = String(row.time_bucket ?? "");
    const label = [bucket, ...groups].filter(Boolean).join(" · ");
    return { bucket, groups, label, value: Number(row.value ?? 0) };
  });
};

/**
 * Render a metric's result rows with the visualization the consumer chose. The
 * view params (granularity + group-by) determine the result shape; the
 * visualization is the (validated) drawing choice over that shape.
 */
export const MetricResult = ({
  rows,
  title,
  view,
  visualization,
}: {
  rows: MetricRows;
  title: string;
  view: ShapeParams;
  visualization: Visualization;
}) => {
  if (visualization === "number") {
    const raw = rows.at(0)?.value;
    const value = raw === null || raw === undefined ? undefined : Number(raw);
    return (
      <MetricCard
        className="h-full content-start"
        label={title}
        value={value}
      />
    );
  }

  if (rows.length === 0) {
    return <WidgetMessage message="No data for this period." title={title} />;
  }

  const points = toPoints(view, rows);

  if (visualization === "area") {
    return (
      <ChartFrame title={title}>
        <AreaChart data={points}>
          <XAxis dataKey="label" fontSize={12} tickLine={false} />
          <YAxis fontSize={12} tickLine={false} />
          <Tooltip />
          <Area
            dataKey="value"
            fill="var(--primary)"
            fillOpacity={0.2}
            stroke="var(--primary)"
            type="monotone"
          />
        </AreaChart>
      </ChartFrame>
    );
  }

  if (visualization === "bar") {
    return (
      <ChartFrame title={title}>
        <BarChart data={points}>
          <XAxis dataKey="label" fontSize={12} tickLine={false} />
          <YAxis fontSize={12} tickLine={false} />
          <Tooltip />
          <Bar dataKey="value" fill="var(--primary)" />
        </BarChart>
      </ChartFrame>
    );
  }

  const groupBy = view.groupBy ?? [];
  const hasBucket = resultShape(view) !== "groups";
  return (
    <div className="h-full rounded-lg border border-border p-4">
      <h2 className="mb-4 font-medium text-sm">{title}</h2>
      <Table>
        <TableHeader>
          <TableRow>
            {hasBucket ? <TableHead>Time</TableHead> : null}
            {groupBy.map((property) => (
              <TableHead key={property}>{property}</TableHead>
            ))}
            <TableHead className="text-right">Value</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {points.map((point) => (
            <TableRow key={point.label}>
              {hasBucket ? <TableCell>{point.bucket}</TableCell> : null}
              {point.groups.map((group, column) => (
                <TableCell key={groupBy[column]}>{group}</TableCell>
              ))}
              <TableCell className="text-right">
                {point.value.toLocaleString()}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};
