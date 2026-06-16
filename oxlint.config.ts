import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";
import react from "ultracite/oxlint/react";

export default defineConfig({
  extends: [core, react],
  ignorePatterns: [
    ...(core.ignorePatterns ?? []),
    // Vendored agent/tooling bundles — third-party, not our source to lint.
    ".agents",
    ".claude",
    ".kiro",
    ".codegraph",
    // Vendored shadcn/ui design-system components — kept close to upstream.
    "packages/ui",
    "apps/landing/src/components/ui",
  ],
  overrides: [
    {
      // TanStack file-based routing encodes route params in filenames
      // (e.g. $projectId.tsx); kebab-case is incompatible with that convention.
      files: ["**/routes/**"],
      rules: {
        "unicorn/filename-case": "off",
      },
    },
  ],
});
