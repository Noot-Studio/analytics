// Outbound links used across the landing sections. Each one can be overridden
// per environment with the matching VITE_* variable (see .env.example); the
// strings here are the defaults used when that variable is unset.
export const GITHUB_URL =
  import.meta.env.VITE_GITHUB_URL ?? "https://github.com/Noot-Studio/analytics";

export const APP_URL =
  import.meta.env.VITE_APP_URL ?? "https://github.com/Noot-Studio/analytics";

export const DOCS_URL =
  import.meta.env.VITE_DOCS_URL ??
  "https://github.com/Noot-Studio/analytics#readme";

// No default: when VITE_DISCORD_URL is unset, the Discord buttons are hidden.
export const DISCORD_URL = import.meta.env.VITE_DISCORD_URL;
