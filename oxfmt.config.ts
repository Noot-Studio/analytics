import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

export default defineConfig({
  ...ultracite,
  ignorePatterns: [
    ...(ultracite.ignorePatterns ?? []),
    // Vendored agent/tooling bundles — third-party, not our source to format.
    ".agents",
    ".claude",
    ".kiro",
    ".codegraph",
    // Vendored shadcn/ui design-system components — kept close to upstream.
    "packages/ui",
  ],
});
