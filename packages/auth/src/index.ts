import { createPrismaClient } from "@sbox-analytics/db";
import { env } from "@sbox-analytics/env/server";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { organization } from "better-auth/plugins";

import {
  canSendEmail,
  sendInvitationEmail,
  sendVerificationEmail,
} from "./emails";
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

    // Only deliverable when Resend is configured; without it, signups would
    // be stuck unverifiable, so verification is dev-disabled alongside the
    // invitation gate below.
    emailVerification: canSendEmail
      ? {
          sendOnSignUp: true,
          sendVerificationEmail: ({ url, user }) =>
            sendVerificationEmail(user.email, url),
        }
      : undefined,

    plugins: [
      steam({ apiKey: env.STEAM_API_KEY }),
      organization({
        // Enforced on addMember and invitation accept; keeps orgs within the
        // dashboard's unpaginated 100-row member list.
        membershipLimit: 100,
        // Invite-takeover protection needs verified emails, which need Resend.
        requireEmailVerificationOnInvitation: canSendEmail,
        sendInvitationEmail: (data) => sendInvitationEmail(data),
      }),
    ],

    secret: env.BETTER_AUTH_SECRET,

    trustedOrigins: [env.CORS_ORIGIN],
  });
}

export const auth = createAuth();
