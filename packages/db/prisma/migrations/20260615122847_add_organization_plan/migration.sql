-- CreateEnum
CREATE TYPE "OrganizationPlan" AS ENUM ('Free', 'Custom');

-- AlterTable
ALTER TABLE "organization" ADD COLUMN     "eventLimit" INTEGER,
ADD COLUMN     "plan" "OrganizationPlan" NOT NULL DEFAULT 'Free';
