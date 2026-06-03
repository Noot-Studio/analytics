import { createPrismaClient } from "@sbox-analytics/db";
import { env } from "@sbox-analytics/env/server";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { organization } from "better-auth/plugins";

import { steam } from "./steam";

export function createAuth() {
  const prisma = createPrismaClient();

  return betterAuth({
    advanced: {
      cookiePrefix: "sbox",
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "none",
        secure: true,
      },
    },

    baseURL: env.BETTER_AUTH_URL,

    database: prismaAdapter(prisma, {
      provider: "postgresql",
    }),

    emailAndPassword: {
      enabled: true,
    },

    plugins: [steam({ apiKey: env.STEAM_API_KEY }), organization()],

    secret: env.BETTER_AUTH_SECRET,

    trustedOrigins: [env.CORS_ORIGIN],
  });
}

export const auth = createAuth();
