import type { MetricWidgetConfig } from "@sbox-analytics/api/dashboard-widgets";
import type { MetricSnapshot } from "@sbox-analytics/api/metrics";
import { useSuspenseQuery } from "@tanstack/react-query";

import { orpc } from "@/utils/orpc";

import type { WidgetRendererProps } from "../../lib/widget-registry";
import { WidgetMessage, MetricResult } from "./metric-result";

const MetricWidgetBody = ({
  metric,
  from,
  projectId,
  to,
}: {
  metric: MetricSnapshot;
  from: string;
  projectId: string;
  to: string;
}) => {
  const { data: rows } = useSuspenseQuery(
    orpc.customAnalytics.query.queryOptions({
      input: {
        ...metric.config,
        projectId,
        timeRange: { from, to },
      },
    })
  );

  return (
    <MetricResult config={metric.config} rows={rows} title={metric.name} />
  );
};

export const SavedMetricWidget = (props: WidgetRendererProps) => {
  const config = props.config as MetricWidgetConfig;
  const projectId = props.projectId ?? config.projectId;

  const { data: metric } = useSuspenseQuery(
    orpc.metrics.get.queryOptions({
      input: {
        id: config.metricId,
        organizationId: props.organizationId,
        projectId,
      },
    })
  );

  // Metric queries are project-scoped; an org-overview widget must pin one.
  if (!projectId) {
    return (
      <WidgetMessage
        message="This widget needs a project. Remove it and re-add it with a project selected."
        title={metric.name}
      />
    );
  }

  return (
    <MetricWidgetBody
      from={props.from}
      metric={metric}
      projectId={projectId}
      to={props.to}
    />
  );
};
