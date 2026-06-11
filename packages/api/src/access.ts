import { ORPCError } from "@orpc/server";
import prisma from "@sbox-analytics/db";

// Roles permitted to perform write operations (create/update/delete/rotate/
// invite/member-management). "member" is read-only. This is the single
// definition of "can manage" shared by every write gate.
const ELEVATED_ROLES = new Set(["owner", "admin"]);

export type MemberRole = string;

export const requireActiveOrg = (context: {
  session: { session: { activeOrganizationId?: string | null } };
}): string => {
  const orgId = context.session.session.activeOrganizationId;
  if (!orgId) {
    throw new ORPCError("FORBIDDEN", { message: "No active organization" });
  }
  return orgId;
};

// Loads the caller's membership role for an organization, throwing FORBIDDEN
// when they are not a member. Resolving the role here lets callers gate writes
// without a second query.
export const loadMemberRole = async (
  organizationId: string,
  userId: string
): Promise<MemberRole> => {
  const member = await prisma.member.findFirst({
    select: { role: true },
    where: { organizationId, userId },
  });
  if (!member) {
    throw new ORPCError("FORBIDDEN", {
      message: "Organization not accessible",
    });
  }
  return member.role;
};

export const assertProjectAccess = async (
  projectId: string,
  userId: string
): Promise<{ organizationId: string; role: MemberRole }> => {
  const project = await prisma.project.findFirst({
    select: { organizationId: true },
    where: { id: projectId },
  });

  if (!project) {
    throw new ORPCError("FORBIDDEN", { message: "Project not found" });
  }

  const role = await loadMemberRole(project.organizationId, userId);
  return { organizationId: project.organizationId, role };
};

// The single write gate: only owners and admins may mutate. Viewers ("member")
// get FORBIDDEN.
export const requireWriteRole = (role: MemberRole): void => {
  if (!ELEVATED_ROLES.has(role)) {
    throw new ORPCError("FORBIDDEN", {
      message: "Only owners and admins can perform this action",
    });
  }
};

interface OrgScopeContext {
  session: {
    session: { activeOrganizationId?: string | null };
    user: { id: string };
  };
}

// Org resolution for handlers whose org comes from heterogeneous input: an
// explicit project, an explicit org id, or the session's active org. Returns
// the resolved org plus the caller's role so writes can gate on it. Shared by
// metrics, widgets, dashboards, and org analytics.
export const resolveOrgScope = async (
  context: OrgScopeContext,
  input: { organizationId?: string; projectId?: string }
): Promise<{ organizationId: string; role: MemberRole }> => {
  if (input.projectId) {
    return assertProjectAccess(input.projectId, context.session.user.id);
  }
  const organizationId = input.organizationId ?? requireActiveOrg(context);
  const role = await loadMemberRole(organizationId, context.session.user.id);
  return { organizationId, role };
};
