import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "@sbox-analytics/env/server";

import { PrismaClient } from "../prisma/generated/client";

export const createPrismaClient = () => {
  const adapter = new PrismaPg({
    connectionString: env.DATABASE_URL,
  });
  return new PrismaClient({ adapter });
};

export {
  CardSize,
  DashboardScope,
  ProjectEnvironment,
} from "../prisma/generated/enums";

const prisma = createPrismaClient();
export default prisma;
