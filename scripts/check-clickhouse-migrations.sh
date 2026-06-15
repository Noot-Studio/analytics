#!/usr/bin/env bash
# Verifies the ClickHouse schema invariant:
#
#   <base-ref> init.sql + current migrations/  ==  current init.sql
#
# i.e. a change to init.sql must ship a matching migration (existing installs
# only ever run migrations), and a migration must be folded into init.sql
# (fresh installs only ever run init.sql). Both schemas are applied to a
# throwaway ClickHouse container and compared via system tables.
#
# Usage: scripts/check-clickhouse-migrations.sh <base-git-ref>
set -euo pipefail

BASE_REF="${1:?usage: check-clickhouse-migrations.sh <base-git-ref>}"
INIT_SQL="packages/db/clickhouse/init.sql"
MIGRATIONS_DIR="packages/db/clickhouse/migrations"
IMAGE="clickhouse/clickhouse-server:24.10-alpine"
CONTAINER="ch-migration-check-$$"

# NB: do not set CLICKHOUSE_DB — it makes the image's entrypoint spin up a
# throwaway server to create the database, then kill it and restart the real
# one. The readiness probe below can connect to that throwaway server moments
# before it's torn down, so init.sql races into a dropped connection
# (ATTEMPT_TO_READ_AFTER_EOF). Start the server once and create the DB by hand.
docker run -d --name "$CONTAINER" "$IMAGE" >/dev/null
trap 'docker rm -f "$CONTAINER" >/dev/null' EXIT

for _ in $(seq 1 60); do
  docker exec "$CONTAINER" clickhouse-client -q 'SELECT 1' >/dev/null 2>&1 && break
  sleep 1
done

ch() { docker exec -i "$CONTAINER" clickhouse-client -n "$@"; }

ch -q "CREATE DATABASE IF NOT EXISTS analytics"

dump_schema() {
  ch -q "SELECT table, name, type, default_expression
         FROM system.columns WHERE database = 'analytics'
         ORDER BY table, position FORMAT TSV"
  ch -q "SELECT name, engine, sorting_key, partition_key, as_select
         FROM system.tables WHERE database = 'analytics'
         ORDER BY name FORMAT TSV"
}

# Schema A: this revision's init.sql on a fresh database.
ch <"$INIT_SQL"
schema_fresh="$(dump_schema)"

ch -q "DROP DATABASE analytics SYNC; CREATE DATABASE analytics"

# Schema B: base revision's init.sql, upgraded by this revision's migrations.
git show "$BASE_REF:$INIT_SQL" | ch
for migration in "$MIGRATIONS_DIR"/*.sql; do
  ch <"$migration"
done
schema_migrated="$(dump_schema)"

if [ "$schema_fresh" != "$schema_migrated" ]; then
  echo "ClickHouse schema drift between init.sql and migrations:" >&2
  echo "(< fresh install via init.sql | > $BASE_REF init.sql + migrations)" >&2
  diff <(echo "$schema_fresh") <(echo "$schema_migrated") >&2 || true
  exit 1
fi

echo "ClickHouse init.sql and migrations are in sync."
