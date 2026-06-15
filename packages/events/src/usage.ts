// Redis keys + period format for the monthly ingested-event usage counter.
// Lives here because the ingest data plane (apps/ingest, increments + enforces)
// and the control plane (packages/api, reads for the dashboard usage endpoint)
// must agree on the exact format, and packages/api can't import from apps/ingest.

// UTC calendar month, e.g. "2026-06". Quotas reset on month boundaries.
export const usagePeriod = (date: Date): string => {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
};

export const usageCounterKey = (organizationId: string, period: string) =>
  `ingest:usage:${organizationId}:${period}`;

// Cached projectId -> { organizationId, eventLimit } plan lookup used by the
// ingest quota check. The control plane invalidates it when an org's
// eventLimit changes.
export const orgPlanCacheKey = (projectId: string): string =>
  `ingest:orgplan:${projectId}`;
