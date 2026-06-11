// Redis cache-key for the ingest API-key resolver. Lives here because both the
// ingest data plane (apps/ingest, populates + reads the cache) and the control
// plane (packages/api, invalidates on revoke/rotate) must agree on the exact
// key format, and packages/api can't import from apps/ingest.

export const apiKeyCacheKey = (publishableKey: string): string =>
  `ingest:apikey:${publishableKey}`;
