# Contributing to sbox-analytics

This guide covers local development. For what the project is and how to run it in
production, see the [README](./README.md).

## Prerequisites

- [Bun](https://bun.sh) (the version in `package.json` → `packageManager`)
- Docker (for the local Postgres / Redis / Redpanda / ClickHouse stack)

## Getting Started

Install the dependencies:

```bash
bun install
```

## Database Setup

This project uses PostgreSQL with Prisma, plus Redis, Redpanda, and ClickHouse for
the analytics pipeline. All four run via Docker Compose:

```bash
bun run db:start   # boot Postgres, Redis, Redpanda, ClickHouse in the background
```

Then apply the Prisma schema to Postgres:

```bash
bun run db:push
```

Run the development server:

```bash
bun run dev
```

Open the web application in your browser (default `http://localhost:4001`); the API
runs at `http://localhost:4000`. Ports come from the root `.env` — see `.env.example`
for every variable.

## UI Customization

React web apps in this stack share shadcn/ui primitives through `packages/ui`.

- Change design tokens and global styles in `packages/ui/src/styles/globals.css`
- Update shared primitives in `packages/ui/src/components/*`
- Adjust shadcn aliases or style config in `packages/ui/components.json` and `apps/web/components.json`

### Add more shared components

Run this from the project root to add more primitives to the shared UI package:

```bash
npx shadcn@latest add accordion dialog popover sheet table -c packages/ui
```

Import shared components like this:

```tsx
import { Button } from "@sbox-analytics/ui/components/button";
```

### Add app-specific blocks

If you want to add app-specific blocks instead of shared primitives, run the shadcn CLI from `apps/web`.

## Git Hooks and Formatting

- Format and lint fix: `bun run check`

## Available Scripts

- `bun run dev`: Start all applications in development mode
- `bun run build`: Build all applications
- `bun run dev:web`: Start only the web application
- `bun run dev:server`: Start only the server
- `bun run check-types`: Check TypeScript types across all apps
- `bun run db:start`: Boot the local infra stack (Postgres, Redis, Redpanda, ClickHouse)
- `bun run db:stop`: Stop the local infra stack
- `bun run db:push`: Push schema changes to database
- `bun run db:generate`: Generate database client/types
- `bun run db:migrate`: Run database migrations
- `bun run db:studio`: Open database studio UI
- `bun run check`: Run Oxlint and Oxfmt
