# syntax=docker/dockerfile:1
# Marketing site (React + TanStack Router, built by Vite). Static output served by nginx.
# Noot's own landing page — NOT part of a self-host. It's an opt-in compose service
# (profile: landing) so a plain `docker compose up` never builds or runs it.
# VITE_* values are baked at build time — pass them as build args.

FROM oven/bun:1.3.5 AS build
WORKDIR /app
ARG VITE_APP_URL=http://localhost:3001
ARG VITE_GITHUB_URL=https://github.com/Noot-Studio/analytics
ARG VITE_DOCS_URL=http://localhost:3002
# No default — when unset, the landing page hides its Discord buttons.
ARG VITE_DISCORD_URL
ENV VITE_APP_URL=$VITE_APP_URL
ENV VITE_GITHUB_URL=$VITE_GITHUB_URL
ENV VITE_DOCS_URL=$VITE_DOCS_URL
ENV VITE_DISCORD_URL=$VITE_DISCORD_URL
# prisma generate (db's postinstall) resolves DATABASE_URL via prisma.config; a
# placeholder satisfies it — generate never connects. Not baked into the bundle.
ENV DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/placeholder
COPY . .
RUN bun install --frozen-lockfile
RUN bunx turbo build --filter=landing

FROM nginx:1.27-alpine AS runtime
COPY apps/landing/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/landing/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --retries=5 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null 2>&1 || exit 1
