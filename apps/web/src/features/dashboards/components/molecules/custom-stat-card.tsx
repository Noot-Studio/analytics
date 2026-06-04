import type { CustomCardConfig } from "@sbox-analytics/api/dashboard-cards";
import { Area } from "@sbox-analytics/ui/components/chart-series";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { MetricCard } from "@/features/analytics/components/molecules/metric-card";
import { orpc } from "@/utils/orpc";

import type { CardRendererProps } from "../../lib/card-registry";

const CHART_HEIGHT = 240;

const CardMessage = ({
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

const CustomStatBody = ({
  config,
  from,
  projectId,
  to,
}: {
  config: CustomCardConfig;
  from: string;
  projectId: string;
  to: string;
}) => {
  // Stored query + render-time bindings; rows come back as
  // { value, time_bucket?, group_col_N? } per the query-builder aliases.
  const { data: rows } = useSuspenseQuery(
    orpc.customAnalytics.query.queryOptions({
      input: {
        ...config.query,
        projectId,
        timeRange: { from, to },
      },
    })
  );

  // ClickHouse JSON output serializes 64-bit aggregates as strings.
  if (config.display === "metric") {
    const raw = rows.at(0)?.value;
    const value = raw === null || raw === undefined ? undefined : Number(raw);
    return <MetricCard label={config.title} value={value} />;
  }

  const series = rows.map((row) => ({
    bucket: String(row.time_bucket ?? ""),
    value: Number(row.value ?? 0),
  }));

  if (series.length === 0) {
    return (
      <CardMessage message="No data for this period." title={config.title} />
    );
  }

  return (
    <div className="h-full rounded-lg border border-border p-4">
      <h2 className="mb-4 font-medium text-sm">{config.title}</h2>
      <ResponsiveContainer height={CHART_HEIGHT} width="100%">
        <AreaChart data={series}>
          <XAxis dataKey="bucket" fontSize={12} tickLine={false} />
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
      </ResponsiveContainer>
    </div>
  );
};

export const CustomStatCard = (props: CardRendererProps) => {
  const config = props.config as CustomCardConfig;
  const projectId = props.projectId ?? config.projectId;

  // customAnalytics is project-scoped; an org-overview card must pin one.
  if (!projectId) {
    return (
      <CardMessage
        message="This card needs a project. Remove it and re-add it with a project selected."
        title={config.title}
      />
    );
  }

  return (
    <CustomStatBody
      config={config}
      from={props.from}
      projectId={projectId}
      to={props.to}
    />
  );
};
