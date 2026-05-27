# `apps/web` — Dashboard (React + TanStack Router + Vite)

The customer-facing analytics dashboard. Renders DAU, session counts, retention, and the live event stream by calling `@sbox-analytics/api` through oRPC.

## Stack

- **Vite** dev server (`bun run dev:web`, port 5173).
- **TanStack Router** for type-safe file-based routing — routes live in `src/routes/`.
- **TanStack Query** + `@orpc/tanstack-query` — typed queries derived from the server router type.
- **Better Auth** client for sessions; auth state syncs with `apps/server`.
- **shadcn/ui primitives** from `@sbox-analytics/ui` — do not duplicate components locally.
- **Tailwind v4** via `@tailwindcss/vite`; tokens come from `@sbox-analytics/ui/globals.css`.

## Layout

```
src/
  main.tsx        # Vite entry
  router.tsx      # TanStack Router config
  routes/         # File-based routes
  features/       # Feature-based components
  components/     # App-specific composite components only
  lib/            # Client helpers (oRPC client, query client, etc.)
```

## Conventions

- Shared primitives live in `packages/ui`. Import as `@sbox-analytics/ui/components/button`. Add app-specific blocks here only when they aren't reusable.
- API types: import the **router type** from `@sbox-analytics/api`, never the implementation. The oRPC client provides full inference.
- Env vars must be prefixed `VITE_` and declared in `@sbox-analytics/env/web`.
- Follow the Ultracite + React rules in the root `CLAUDE.md` — no class components, hooks at top level, semantic HTML.

## Feature-based and atomic-based component structure

Agents must organize UI code by feature first, then by atomic component level.

Use the following structure:

```txt
@/features/<feature-name>/components/<organisms|molecules|atoms>
```

### Component organization rules

Each feature owns its own UI components. Components should be colocated inside the feature they belong to unless they are truly shared across multiple features.

```txt
@/features/
  <feature-name>/
    components/
      atoms/
      molecules/
      organisms/
```

### Atomic component levels

#### Atoms

Atoms are the smallest reusable UI elements. They should be simple, focused, and mostly presentation-based.

Examples:

```txt
@/features/auth/components/atoms/LoginButton.tsx
@/features/billing/components/atoms/PriceLabel.tsx
@/features/dashboard/components/atoms/StatusBadge.tsx
```

Use atoms for:

- Buttons
- Badges
- Labels
- Icons
- Inputs
- Small text or display primitives
- Feature-specific wrappers around shared UI primitives

Atoms should not contain business logic or fetch data directly.

#### Molecules

Molecules combine multiple atoms into a small, reusable UI group.

Examples:

```txt
@/features/auth/components/molecules/LoginForm.tsx
@/features/billing/components/molecules/PricingCard.tsx
@/features/dashboard/components/molecules/MetricCard.tsx
```

Use molecules for:

- Forms
- Cards
- Search bars
- Filter groups
- Small composed UI sections
- Reusable feature-specific component groups

Molecules may contain light UI state, but they should not own full feature workflows.

#### Organisms

Organisms are larger sections composed of atoms, molecules, and other organisms.

Examples:

```txt
@/features/auth/components/organisms/AuthPanel.tsx
@/features/billing/components/organisms/PricingSection.tsx
@/features/dashboard/components/organisms/DashboardOverview.tsx
```

Use organisms for:

- Full page sections
- Complex feature areas
- Data-driven UI blocks
- Layout sections within a feature
- Components that coordinate multiple molecules

Organisms may receive data from hooks, loaders, server functions, or parent pages, but should avoid unnecessary coupling to unrelated features.

### Import rules

Prefer importing components from within the same feature:

```tsx
import { LoginForm } from "@/features/auth/components/molecules/LoginForm";
```

Do not import across feature component trees unless there is a strong feature dependency.

Avoid this unless explicitly justified:

```tsx
import { PricingCard } from "@/features/billing/components/molecules/PricingCard";
```

If a component is needed by multiple unrelated features, move it to a shared location instead of importing it from another feature.

Recommended shared location:

```txt
@/components/
  atoms/
  molecules/
  organisms/
```

Use shared components only for generic, reusable UI that has no feature-specific behavior.

### Naming rules

Component names must be descriptive and reflect their role.

Good examples:

```txt
LoginForm.tsx
PricingCard.tsx
DashboardOverview.tsx
UserStatusBadge.tsx
```

Avoid vague names:

```txt
Form.tsx
Card.tsx
Section.tsx
Block.tsx
```

### Barrel exports

Each atomic folder may include an `index.ts` file when it improves imports.

Example:

```txt
@/features/auth/components/atoms/index.ts
@/features/auth/components/molecules/index.ts
@/features/auth/components/organisms/index.ts
```

Example export:

```ts
export * from "./LoginButton";
export * from "./AuthErrorMessage";
```

### Agent requirements

When creating or modifying feature UI components, agents must:

1. Place components under the correct feature folder.
2. Choose the correct atomic level: `atoms`, `molecules`, or `organisms`.
3. Avoid placing feature-specific components in global shared folders.
4. Avoid cross-feature imports unless the dependency is intentional.
5. Move truly reusable UI to shared component folders.
6. Keep atoms simple and presentation-focused.
7. Keep molecules focused on small composed UI groups.
8. Keep organisms responsible for larger feature sections.
9. Use clear, feature-aware component names.
10. Prefer colocating feature-specific UI, hooks, types, and utilities within the same feature when applicable.

### Example

```txt
@/features/checkout/
  components/
    atoms/
      CheckoutStepBadge.tsx
      PriceText.tsx
    molecules/
      PaymentMethodCard.tsx
      OrderSummaryCard.tsx
    organisms/
      CheckoutForm.tsx
      CheckoutSummaryPanel.tsx
```

This structure should be followed consistently for all new feature UI work.

## Adding a feature

1. New oRPC procedure in `packages/api/src/routers/`.
2. New route under `src/routes/` consuming it via the typed client.
3. UI components under `@/features/<feature-name>/components/` following the atomic structure above.
4. Use primitives from `@sbox-analytics/ui`; add a shadcn primitive there if missing rather than reinventing it.
