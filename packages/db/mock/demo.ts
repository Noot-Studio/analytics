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

// Hardware spec pools — one stable pick per player, sent on every
// session_start. Powers the specs panel on the player profile page.
// OS pool is keyed by platform so platform and os never contradict.
export const DEMO_OSES_BY_PLATFORM: Record<
  (typeof DEMO_PLATFORMS)[number],
  readonly string[]
> = {
  Linux: ["Arch Linux", "Ubuntu 24.04"],
  Windows: ["Windows 11", "Windows 10"],
  macOS: ["macOS 15.2", "macOS 14.6"],
} as const;

const DISCRETE_GPUS = [
  "NVIDIA RTX 4090",
  "NVIDIA RTX 4070",
  "NVIDIA RTX 3060",
  "AMD RX 7800 XT",
  "AMD RX 6600",
  "Intel Arc A770",
] as const;

export const DEMO_GPUS_BY_PLATFORM: Record<
  (typeof DEMO_PLATFORMS)[number],
  readonly string[]
> = {
  Linux: DISCRETE_GPUS,
  Windows: DISCRETE_GPUS,
  macOS: ["Apple M4 Pro", "Apple M3", "Apple M2 Max"],
} as const;

export const DEMO_CPUS = [
  "AMD Ryzen 7 7800X3D",
  "AMD Ryzen 5 5600X",
  "Intel Core i7-13700K",
  "Intel Core i5-12400F",
] as const;

export const DEMO_RAM_GB = [16, 32, 64] as const;

export const DEMO_RESOLUTIONS = [
  "1920x1080",
  "2560x1440",
  "3440x1440",
  "3840x2160",
] as const;
