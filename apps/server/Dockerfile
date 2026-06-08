# syntax=docker/dockerfile:1
# Dashboard API (Hono + oRPC) — runs on Bun. Build context is the repo root.

# ---- prune: reduce the monorepo to just this app's dependency closure ----
FROM oven/bun:1.3.5 AS prune
WORKDIR /app
COPY . .
RUN bunx turbo prune server --docker

# ---- build: install deps, generate Prisma client, bundle the app ----
FROM oven/bun:1.3.5 AS build
WORKDIR /app
# prisma generate resolves DATABASE_URL via prisma.config; a placeholder satisfies
# it — generate never connects. The real URL is provided at runtime.
ENV DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/placeholder
COPY --from=prune /app/out/json/ ./
COPY --from=prune /app/out/bun.lock ./bun.lock
RUN bun install --frozen-lockfile --ignore-scripts
COPY --from=prune /app/out/full/ ./
RUN cd packages/db && bunx prisma generate
RUN bunx turbo build --filter=server

# ---- prod-deps: production-only closure for this app ----
# --linker=hoisted overrides bunfig's isolated linker so every runtime dep lands
# in a single flat node_modules that the bundled dist can resolve.
FROM oven/bun:1.3.5 AS prod-deps
WORKDIR /app
COPY --from=prune /app/out/json/ ./
COPY --from=prune /app/out/bun.lock ./bun.lock
RUN bun install --frozen-lockfile --production --ignore-scripts --linker=hoisted

# ---- runtime ----
FROM oven/bun:1.3.5-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/packages/db/prisma/generated ./packages/db/prisma/generated
COPY --from=build /app/apps/server/dist ./dist
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=5 \
  CMD bun -e "fetch('http://127.0.0.1:'+(process.env.SERVER_PORT||3000)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["bun", "run", "dist/index.mjs"]
