# `packages/ui` — Shared Design System

shadcn/ui primitives + Tailwind tokens reused by every React app in the monorepo (`apps/web`, and any future React surface). Centralizing them here keeps the dashboard, marketing, and future apps visually coherent.

## Layout

```
src/
  components/        # shadcn primitives (button, input, dialog, ...)
  hooks/             # Reusable React hooks
  lib/               # cn() and other tiny helpers
  styles/
    globals.css      # Tailwind v4 layer + design tokens (colors, radii, spacing)
components.json      # shadcn config for this package
postcss.config.mjs   # Re-exported as @sbox-analytics/ui/postcss.config
```

Exports (see `package.json`):

```ts
import { Button } from "@sbox-analytics/ui/components/button";
import { cn } from "@sbox-analytics/ui/lib/utils";
import "@sbox-analytics/ui/globals.css";
```

## Conventions

- **One copy of every primitive lives here.** If `apps/web` needs a Tooltip, add it here via shadcn rather than inlining it.
- **Add components with the shadcn CLI targeting this package**, run from repo root:
  ```bash
  npx shadcn@latest add <component> -c packages/ui
  ```
- **App-specific composites** (e.g. a project-switcher built from Button + Popover + Avatar) belong in `apps/web/src/components/`, not here.
- **Design tokens** (colors, radii, font stacks) live in `src/styles/globals.css`. Change them once; every app picks them up.
- **No app imports allowed.** This package depends on React + base-ui + Tailwind only — never on `@sbox-analytics/api`, `@sbox-analytics/db`, or any app workspace.
- **Accessibility is non-negotiable.** Use base-ui / shadcn primitives' built-in ARIA; follow the React + accessibility rules in the root `CLAUDE.md`.
