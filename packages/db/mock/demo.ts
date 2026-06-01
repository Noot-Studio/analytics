import { createHash } from "node:crypto";

// Stable identifiers for the demo tenant. Re-running the seed upserts on these ids,
// so the demo user/org/project/API key are idempotent across runs.

export const DEMO_USER = {
  email: "demo@sbox-analytics.dev",
  id: "demo-user",
  name: "Demo Developer",
  password: "demo-password-123",
} as const;

export const DEMO_ORG = {
  id: "demo-org",
  name: "Demo Studio",
  slug: "demo-studio",
} as const;

export const DEMO_PROJECT = {
  environment: "Production",
  id: "demo-project",
  name: "Demo Game",
  slug: "demo-game",
} as const;

// Publishable key is sent in the SDK; the secret is shown once and stored hashed.
// These are fixed (non-secret) demo values — never reuse this pattern for real keys.
export const DEMO_API_KEY = {
  id: "demo-api-key",
  name: "Default",
  publishableKey: "pk_demo_publishable_key",
  secret: "sk_demo_secret_key",
  get secretHash(): string {
    return createHash("sha256").update(this.secret).digest("hex");
  },
} as const;

// Maps / platforms / versions used across generated events — drives the
// breakdown, maps, and performance dashboard pages.
export const DEMO_MAPS = [
  "dm_dust",
  "dm_arena",
  "ctf_forest",
  "surf_utopia",
  "bhop_speedway",
] as const;

export const DEMO_PLATFORMS = ["Windows", "Linux", "macOS"] as const;

export const DEMO_VERSIONS = ["1.2.0", "1.3.0", "1.3.1"] as const;
