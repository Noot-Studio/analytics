# syntax=docker/dockerfile:1
# Public documentation site (fumadocs + TanStack Start, prerendered to static). Served by nginx.
# NOTE: the prerender step boots a server and crawls it at build time — build with
# host networking so the crawler can reach it:  docker build --network=host ...
# (docker-compose.yaml sets build.network: host for this service automatically.)

FROM oven/bun:1.3.5 AS build
WORKDIR /app
# The monorepo install runs db's postinstall (prisma generate), which resolves
# DATABASE_URL via prisma.config; a placeholder satisfies it (docs needs no DB).
ENV DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/placeholder
COPY . .
RUN bun install --frozen-lockfile
RUN bunx turbo build --filter=fumadocs

FROM nginx:1.27-alpine AS runtime
COPY apps/fumadocs/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/fumadocs/dist/client /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --retries=5 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null 2>&1 || exit 1
