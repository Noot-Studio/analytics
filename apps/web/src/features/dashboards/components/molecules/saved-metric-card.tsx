import type { MetricCardConfig } from "@sbox-analytics/api/dashboard-cards";
import type { MetricSnapshot } from "@sbox-analytics/api/metrics";
import { useSuspenseQuery } from "@tanstack/react-query";

import { orpc } from "@/utils/orpc";

import type { CardRendererProps } from "../../lib/card-registry";
import { CardMessage, MetricResult } from "./metric-result";

const MetricCardBody = ({
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

export const SavedMetricCard = (props: CardRendererProps) => {
  const config = props.config as MetricCardConfig;
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

  // Metric queries are project-scoped; an org-overview card must pin one.
  if (!projectId) {
    return (
      <CardMessage
        message="This card needs a project. Remove it and re-add it with a project selected."
        title={metric.name}
      />
    );
  }

  return (
    <MetricCardBody
      from={props.from}
      metric={metric}
      projectId={projectId}
      to={props.to}
    />
  );
};
