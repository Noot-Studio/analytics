# Releasing

Releases are automated with [release-please](https://github.com/googleapis/release-please) and GitHub Actions.

## Flow

1. Merge work into `main` using [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `feat!:` / `BREAKING CHANGE:` drive the semver bump).
2. `release.yml` maintains a rolling **release PR** that accumulates the changelog and version bump (`package.json` + `.release-please-manifest.json`).
3. Merging the release PR creates the `vX.Y.Z` tag and a **GitHub Release** with source archives attached.
4. The `v*` tag triggers `docker.yml`, which builds and pushes all app images (`server`, `ingest`, `web`, `docs`) to GHCR tagged `X.Y.Z`, plus `latest` on the default branch:

   ```
   ghcr.io/noot-studio/sbox-analytics/<app>:X.Y.Z
   ```

No manual tagging, no manual changelog edits — everything is derived from commit messages.

## One-time repository setup

- Create the `main` branch (e.g. `git push origin dev:main`) — release automation only runs there.
- In repo **Settings → Actions → General**, enable **"Allow GitHub Actions to create and approve pull requests"** (release-please opens the release PR with `GITHUB_TOKEN`).

## Database migrations

The `migrate` one-shot service in `docker-compose.yaml` (published to GHCR as `.../migrate` by `docker.yml`) runs before `server`/`ingest` start and applies both stores:

- **Postgres**: `prisma migrate deploy` applies the committed history in `packages/db/prisma/migrations/`. Never use `prisma db push` against production — it has no history and can drop data. New migrations are authored in dev with `bun run db:migrate` (prisma migrate dev) and committed.
- **ClickHouse**: `packages/db/clickhouse/migrate.ts` applies every file in `packages/db/clickhouse/migrations/` in filename order on every deploy. There is no history table, so every migration **must be idempotent** (`CREATE/ALTER ... IF NOT EXISTS`, `DROP ... IF EXISTS`).

**Baselining a database that predates the migration history** (was provisioned with `db push`): mark the initial migration as already applied once, then `migrate deploy` works normally:

```sh
cd packages/db && bunx prisma migrate resolve --applied 0_init
```

## SDK coordination (`Noot-Studio/analytics-library`)

The s&box SDK is versioned and released from its own repository, but ingest API changes may require lockstep releases in either direction.

- **Platform → SDK**: when a release is published here, the `notify-sdk` job sends a `repository_dispatch` event (`analytics-release`, payload `{tag, version}`) to `Noot-Studio/analytics-library`. The SDK repo can listen with `on: repository_dispatch: types: [analytics-release]` to open a coordination issue or kick off its own release. Requires a `RELEASE_DISPATCH_TOKEN` secret on this repo (fine-grained PAT with `contents: write` on the SDK repo); the job is skipped if the secret is absent.
- **SDK → Platform**: `release.yml` accepts `workflow_dispatch`, so the SDK repo (or a maintainer) can trigger a release run here via the GitHub API:

  ```sh
  gh workflow run release.yml --repo Noot-Studio/analytics --ref main
  ```

When an ingest contract change requires both sides, land the platform change first, release it, then release the SDK against the published version.
