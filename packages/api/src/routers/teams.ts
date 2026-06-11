import { createHmac, timingSafeEqual } from "node:crypto";

import { ORPCError } from "@orpc/server";
import { auth } from "@sbox-analytics/auth";
import { canSendEmail } from "@sbox-analytics/auth/emails";
import prisma from "@sbox-analytics/db";
import { env } from "@sbox-analytics/env/server";
import { z } from "zod";

import { loadMemberRole, requireWriteRole } from "../access";
import { protectedProcedure } from "../index";

// Invite links stay valid for 7 days.
const INVITE_LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MIN_PASSWORD_LENGTH = 8;

const invitableRoleSchema = z.enum(["admin", "member"]);

interface InviteLinkPayload {
  organizationId: string;
  role: "admin" | "member";
  exp: number;
}

const signInviteToken = (payload: InviteLinkPayload): string => {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", env.BETTER_AUTH_SECRET)
    .update(body)
    .digest("base64url");
  return `${body}.${sig}`;
};

const verifyInviteToken = (token: string): InviteLinkPayload | null => {
  const dot = token.indexOf(".");
  if (dot === -1) {
    return null;
  }
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac("sha256", env.BETTER_AUTH_SECRET)
    .update(body)
    .digest("base64url");
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf-8"));
  } catch {
    return null;
  }
};

// Members are managed by owners/admins only. Resolving the role through the
// shared helper keeps the gate identical to every other write in the API.
const assertCanManageMembers = async (
  userId: string,
  organizationId: string
): Promise<void> => {
  const role = await loadMemberRole(organizationId, userId);
  requireWriteRole(role);
};

export const teamsRouter = {
  // Which invite methods the UI can offer; email invites need Resend.
  capabilities: protectedProcedure.handler(() => ({
    emailInvites: canSendEmail,
  })),

  createInviteLink: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().min(1),
        role: invitableRoleSchema,
      })
    )
    .handler(async ({ context, input }) => {
      await assertCanManageMembers(
        context.session.user.id,
        input.organizationId
      );

      const token = signInviteToken({
        exp: Date.now() + INVITE_LINK_TTL_MS,
        organizationId: input.organizationId,
        role: input.role,
      });

      return { url: `${env.CORS_ORIGIN}/join/${token}` };
    }),

  createMember: protectedProcedure
    .input(
      z.object({
        email: z.email(),
        name: z.string().min(1).max(100),
        organizationId: z.string().min(1),
        password: z.string().min(MIN_PASSWORD_LENGTH),
        role: invitableRoleSchema,
      })
    )
    .handler(async ({ context, input }) => {
      await assertCanManageMembers(
        context.session.user.id,
        input.organizationId
      );

      let userId: string;
      try {
        const signUp = await auth.api.signUpEmail({
          body: {
            email: input.email,
            name: input.name,
            password: input.password,
          },
        });
        userId = signUp.user.id;
      } catch {
        throw new ORPCError("CONFLICT", {
          message: "A user with this email already exists",
        });
      }

      await auth.api.addMember({
        body: {
          organizationId: input.organizationId,
          role: input.role,
          userId,
        },
      });

      return { email: input.email, userId };
    }),

  joinViaLink: protectedProcedure
    .input(z.object({ token: z.string().min(1) }))
    .handler(async ({ context, input }) => {
      const payload = verifyInviteToken(input.token);
      if (!payload) {
        throw new ORPCError("BAD_REQUEST", {
          message: "Invalid invitation link",
        });
      }
      if (payload.exp < Date.now()) {
        throw new ORPCError("BAD_REQUEST", {
          message: "This invitation link has expired",
        });
      }

      const organization = await prisma.organization.findFirst({
        select: { id: true, name: true },
        where: { id: payload.organizationId },
      });
      if (!organization) {
        throw new ORPCError("NOT_FOUND", {
          message: "Organization not found",
        });
      }

      const existing = await prisma.member.findFirst({
        select: { id: true },
        where: {
          organizationId: organization.id,
          userId: context.session.user.id,
        },
      });
      if (existing) {
        return {
          alreadyMember: true,
          organizationId: organization.id,
          organizationName: organization.name,
        };
      }

      await auth.api.addMember({
        body: {
          organizationId: organization.id,
          role: payload.role,
          userId: context.session.user.id,
        },
      });

      return {
        alreadyMember: false,
        organizationId: organization.id,
        organizationName: organization.name,
      };
    }),
};
