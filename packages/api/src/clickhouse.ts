import { createClient } from "@clickhouse/client";
import type { ClickHouseClient } from "@clickhouse/client";
import { env } from "@sbox-analytics/env/server";

let client: ClickHouseClient | undefined;

export function clickhouse(): ClickHouseClient {
  if (!client) {
    client = createClient({
      clickhouse_settings: {
        async_insert: 1,
        wait_for_async_insert: 0,
      },
      database: env.CLICKHOUSE_DATABASE,
      password: env.CLICKHOUSE_PASSWORD,
      url: env.CLICKHOUSE_URL,
      username: env.CLICKHOUSE_USER,
    });
  }
  return client;
}
