import type { CustomWidgetConfig } from "@sbox-analytics/api/dashboard-widgets";
import { Area } from "@sbox-analytics/ui/components/chart-series";
import {
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { MetricCard } from "@/features/analytics/components/molecules/metric-card";

import { useCustomWidgetQuery } from "../../lib/widget-data";
import type { WidgetRendererProps } from "../../lib/widget-registry";

const CHART_HEIGHT = 240;

const WidgetMessage = ({
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
  config: CustomWidgetConfig;
  from: string;
  projectId: string;
  to: string;
}) => {
  const { metricValue, series } = useCustomWidgetQuery(config, {
    from,
    projectId,
    to,
  });

  if (config.display === "metric") {
    return <MetricCard label={config.title} value={metricValue} />;
  }

  if (series.length === 0) {
    return (
      <WidgetMessage message="No data for this period." title={config.title} />
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

export const CustomStatWidget = (props: WidgetRendererProps) => {
  const config = props.config as CustomWidgetConfig;
  const projectId = props.projectId ?? config.projectId;

  // customAnalytics is project-scoped; an org-overview widget must pin one.
  if (!projectId) {
    return (
      <WidgetMessage
        message="This widget needs a project. Remove it and re-add it with a project selected."
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
