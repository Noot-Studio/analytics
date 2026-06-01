import { createClient } from "@clickhouse/client";
import { env } from "@sbox-analytics/env/server";
import { hashPassword } from "better-auth/crypto";

import {
  DEMO_API_KEY,
  DEMO_ORG,
  DEMO_PROJECT,
  DEMO_USER,
  generateDemoEvents,
} from "../mock";
import prisma from "../src/index";

// MV target tables that are repopulated from `events` — cleared per demo project
// so re-running the seed never double-counts aggregates.
const CH_TABLES_TO_RESET = [
  "events",
  "events_daily",
  "player_first_seen",
  "sessions_summary",
] as const;
const INSERT_CHUNK = 20_000;
const DEMO_MEMBER_ID = "demo-member";
const DEMO_ACCOUNT_ID = "demo-account";

const log = (message: string): void => {
  process.stdout.write(`${message}\n`);
};

const seedPostgres = async (): Promise<void> => {
  // Hash with Better Auth's own scrypt helper so the credential verifies on login,
  // without importing the configured auth instance (which would cycle db ↔ auth).
  const passwordHash = await hashPassword(DEMO_USER.password);

  await prisma.user.upsert({
    create: {
      email: DEMO_USER.email,
      emailVerified: true,
      id: DEMO_USER.id,
      name: DEMO_USER.name,
    },
    update: { email: DEMO_USER.email, name: DEMO_USER.name },
    where: { id: DEMO_USER.id },
  });

  await prisma.account.upsert({
    create: {
      accountId: DEMO_USER.id,
      id: DEMO_ACCOUNT_ID,
      password: passwordHash,
      providerId: "credential",
      userId: DEMO_USER.id,
    },
    update: { password: passwordHash },
    where: { id: DEMO_ACCOUNT_ID },
  });

  await prisma.organization.upsert({
    create: { id: DEMO_ORG.id, name: DEMO_ORG.name, slug: DEMO_ORG.slug },
    update: { name: DEMO_ORG.name, slug: DEMO_ORG.slug },
    where: { id: DEMO_ORG.id },
  });

  await prisma.member.upsert({
    create: {
      id: DEMO_MEMBER_ID,
      organizationId: DEMO_ORG.id,
      role: "owner",
      userId: DEMO_USER.id,
    },
    update: {
      organizationId: DEMO_ORG.id,
      role: "owner",
      userId: DEMO_USER.id,
    },
    where: { id: DEMO_MEMBER_ID },
  });

  await prisma.project.upsert({
    create: {
      environment: DEMO_PROJECT.environment,
      id: DEMO_PROJECT.id,
      name: DEMO_PROJECT.name,
      organizationId: DEMO_ORG.id,
      slug: DEMO_PROJECT.slug,
    },
    update: { name: DEMO_PROJECT.name, slug: DEMO_PROJECT.slug },
    where: { id: DEMO_PROJECT.id },
  });

  await prisma.apiKey.upsert({
    create: {
      id: DEMO_API_KEY.id,
      name: DEMO_API_KEY.name,
      projectId: DEMO_PROJECT.id,
      publishableKey: DEMO_API_KEY.publishableKey,
      secretHash: DEMO_API_KEY.secretHash,
    },
    update: { secretHash: DEMO_API_KEY.secretHash },
    where: { id: DEMO_API_KEY.id },
  });
};

const seedClickHouse = async (): Promise<number> => {
  const client = createClient({
    database: env.CLICKHOUSE_DATABASE,
    password: env.CLICKHOUSE_PASSWORD,
    url: env.CLICKHOUSE_URL,
    username: env.CLICKHOUSE_USER,
  });

  try {
    for (const table of CH_TABLES_TO_RESET) {
      await client.command({
        clickhouse_settings: { mutations_sync: "1" },
        query: `ALTER TABLE ${env.CLICKHOUSE_DATABASE}.${table} DELETE WHERE project_id = {projectId:String}`,
        query_params: { projectId: DEMO_PROJECT.id },
      });
    }

    const events = generateDemoEvents();
    for (let i = 0; i < events.length; i += INSERT_CHUNK) {
      await client.insert({
        format: "JSONEachRow",
        table: `${env.CLICKHOUSE_DATABASE}.events`,
        values: events.slice(i, i + INSERT_CHUNK),
      });
    }
    return events.length;
  } finally {
    await client.close();
  }
};

const main = async (): Promise<void> => {
  log("Seeding demo data…");
  await seedPostgres();
  const eventCount = await seedClickHouse();

  log("");
  log("✓ Demo data seeded.");
  log(`  Org:     ${DEMO_ORG.name} (${DEMO_ORG.slug})`);
  log(`  Project: ${DEMO_PROJECT.name} (${DEMO_PROJECT.id})`);
  log(`  Events:  ${eventCount} inserted into ClickHouse`);
  log("");
  log("  Login:");
  log(`    Email:    ${DEMO_USER.email}`);
  log(`    Password: ${DEMO_USER.password}`);
  log("  API keys:");
  log(`    Publishable: ${DEMO_API_KEY.publishableKey}`);
  log(`    Secret:      ${DEMO_API_KEY.secret}`);
};

try {
  await main();
} catch (error) {
  process.exitCode = 1;
  process.stderr.write(`${String(error)}\n`);
} finally {
  await prisma.$disconnect();
}
