# syntax=docker/dockerfile:1
# Dashboard SPA (React + TanStack Router, built by Vite). Static output served by nginx.
# VITE_* values are baked at build time — pass them as build args.

FROM oven/bun:1.3.5 AS build
WORKDIR /app
ARG VITE_SERVER_URL=http://localhost:3000
ARG VITE_DOCS_URL=http://localhost:3002
ENV VITE_SERVER_URL=$VITE_SERVER_URL
ENV VITE_DOCS_URL=$VITE_DOCS_URL
# prisma generate (db's postinstall) resolves DATABASE_URL via prisma.config; a
# placeholder satisfies it — generate never connects. Not baked into the bundle.
ENV DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/placeholder
COPY . .
RUN bun install --frozen-lockfile
RUN bunx turbo build --filter=web

FROM nginx:1.27-alpine AS runtime
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --retries=5 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null 2>&1 || exit 1
