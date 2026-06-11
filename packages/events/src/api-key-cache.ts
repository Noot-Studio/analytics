// Redis cache-key for the ingest API-key resolver. Lives here because both the
// ingest data plane (apps/ingest, populates + reads the cache) and the control
// plane (packages/api, invalidates on revoke/rotate) must agree on the exact
// key format, and packages/api can't import from apps/ingest.

export const apiKeyCacheKey = (publishableKey: string): string =>
  `ingest:apikey:${publishableKey}`;

// Secret-key resolver cache (editor read endpoints). Keyed by the sha256 hash
// of the secret, never the raw secret, so Redis never holds usable credentials.
export const apiSecretCacheKey = (secretHash: string): string =>
  `ingest:apisecret:${secretHash}`;
