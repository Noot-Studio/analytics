import { ORPCError } from "@orpc/server";
import prisma from "@sbox-analytics/db";
import { env } from "@sbox-analytics/env/server";
import { z } from "zod";

import { protectedProcedure } from "../index";

// The web client downscales to 256px before uploading; this cap only guards
// against clients sending raw originals.
const MAX_IMAGE_BYTES = 512 * 1024;
const ALLOWED_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"];
// Roles allowed to change the organization logo.
const ELEVATED_ROLES = new Set(["owner", "admin"]);

const imageFileSchema = z
  .file()
  .max(MAX_IMAGE_BYTES, "Image must be smaller than 512KB")
  .mime(ALLOWED_MIME_TYPES);

type ImageOwner = { userId: string } | { organizationId: string };

const assertCanManageOrg = async (
  userId: string,
  organizationId: string
): Promise<void> => {
  const membership = await prisma.member.findFirst({
    select: { role: true },
    where: { organizationId, userId },
  });
  if (!membership || !ELEVATED_ROLES.has(membership.role)) {
    throw new ORPCError("FORBIDDEN", {
      message: "Only owners and admins can change the organization logo",
    });
  }
};

// Each owner keeps a single image: storing a new one replaces the previous.
const storeImage = async (file: File, owner: ImageOwner) => {
  const data = Buffer.from(await file.arrayBuffer());
  await prisma.uploadedImage.deleteMany({ where: owner });
  const image = await prisma.uploadedImage.create({
    data: { data, mimeType: file.type, ...owner },
    select: { id: true },
  });
  return { url: `${env.BETTER_AUTH_URL}/images/${image.id}` };
};

export const imagesRouter = {
  // Better Auth's organization.update doesn't accept a null logo, so clearing
  // it (plus the stored blob) happens here.
  removeOrgLogo: protectedProcedure
    .input(z.object({ organizationId: z.string().min(1) }))
    .handler(async ({ context, input }) => {
      await assertCanManageOrg(context.session.user.id, input.organizationId);
      await prisma.uploadedImage.deleteMany({
        where: { organizationId: input.organizationId },
      });
      await prisma.organization.update({
        data: { logo: null },
        where: { id: input.organizationId },
      });
      return { success: true };
    }),

  uploadAvatar: protectedProcedure
    .input(z.object({ file: imageFileSchema }))
    .handler(({ context, input }) =>
      storeImage(input.file, { userId: context.session.user.id })
    ),

  uploadOrgLogo: protectedProcedure
    .input(
      z.object({
        file: imageFileSchema,
        organizationId: z.string().min(1),
      })
    )
    .handler(async ({ context, input }) => {
      await assertCanManageOrg(context.session.user.id, input.organizationId);
      return storeImage(input.file, { organizationId: input.organizationId });
    }),
};
