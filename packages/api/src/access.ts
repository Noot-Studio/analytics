import { ORPCError } from "@orpc/server";
import prisma from "@sbox-analytics/db";

export const requireActiveOrg = (context: {
  session: { session: { activeOrganizationId?: string | null } };
}): string => {
  const orgId = context.session.session.activeOrganizationId;
  if (!orgId) {
    throw new ORPCError("FORBIDDEN", { message: "No active organization" });
  }
  return orgId;
};

export const assertOrgAccess = async (
  organizationId: string,
  userId: string
): Promise<void> => {
  const member = await prisma.member.findFirst({
    select: { id: true },
    where: { organizationId, userId },
  });
  if (!member) {
    throw new ORPCError("FORBIDDEN", {
      message: "Organization not accessible",
    });
  }
};

export const assertProjectAccess = async (
  projectId: string,
  userId: string
): Promise<string> => {
  const project = await prisma.project.findFirst({
    select: { organizationId: true },
    where: { id: projectId },
  });

  if (!project) {
    throw new ORPCError("FORBIDDEN", { message: "Project not found" });
  }

  await assertOrgAccess(project.organizationId, userId);
  return project.organizationId;
};
