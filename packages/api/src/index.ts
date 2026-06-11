import { ORPCError, os } from "@orpc/server";

import {
  assertProjectAccess,
  loadMemberRole,
  requireActiveOrg,
  requireWriteRole,
} from "./access";
import type { Context } from "./context";

export const o = os.$context<Context>();

export const publicProcedure = o;

const requireAuth = o.middleware(({ context, next }) => {
  if (!context.session?.user) {
    throw new ORPCError("UNAUTHORIZED");
  }
  return next({
    context: {
      session: context.session,
    },
  });
});

export const protectedProcedure = publicProcedure.use(requireAuth);

// Resolves the active organization, asserts membership, and injects the
// caller's role so handlers never re-resolve access. Org comes from the
// session's active organization. Runs after requireAuth, so a session exists.
const withActiveOrg = o.middleware(async ({ context, next }) => {
  const { session } = context;
  if (!session?.user) {
    throw new ORPCError("UNAUTHORIZED");
  }
  const organizationId = requireActiveOrg({ session });
  const role = await loadMemberRole(organizationId, session.user.id);
  return next({ context: { organizationId, role } });
});

// Pulls projectId out of a procedure's validated input. Project procedures are
// only attached to inputs that carry a projectId, so this is always present at
// runtime; the guard keeps the type honest.
const projectIdFromInput = (input: unknown): string => {
  if (
    typeof input === "object" &&
    input !== null &&
    "projectId" in input &&
    typeof input.projectId === "string"
  ) {
    return input.projectId;
  }
  throw new ORPCError("BAD_REQUEST", { message: "projectId is required" });
};

// Resolves the organization from `input.projectId`, asserts project access, and
// injects organizationId + role. Every consumer's input carries a projectId.
const withProject = o.middleware(async ({ context, next }, input: unknown) => {
  if (!context.session?.user) {
    throw new ORPCError("UNAUTHORIZED");
  }
  const { organizationId, role } = await assertProjectAccess(
    projectIdFromInput(input),
    context.session.user.id
  );
  return next({ context: { organizationId, role } });
});

// Org-scoped read: any member. Injects { organizationId, role }.
export const orgProcedure = protectedProcedure.use(withActiveOrg);

// Org-scoped write: owners/admins only. The write gate runs after a role has
// been injected; viewers ("member") get FORBIDDEN. requireWriteRole is the
// single definition of "can manage", shared by every write procedure.
export const orgWriteProcedure = orgProcedure.use(({ context, next }) => {
  requireWriteRole(context.role);
  return next();
});

// Project-scoped read: any member of the project's org. Injects
// { organizationId, role }. Requires the handler's input to carry projectId.
export const projectProcedure = protectedProcedure.use(withProject);

// Project-scoped write: owners/admins only.
export const projectWriteProcedure = projectProcedure.use(
  ({ context, next }) => {
    requireWriteRole(context.role);
    return next();
  }
);
