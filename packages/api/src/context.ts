import { auth } from "@sbox-analytics/auth";
import type { Context as HonoContext } from "hono";

import { createChClient } from "./ch-client";

export interface CreateContextOptions {
  context: HonoContext;
}

export const createContext = async ({ context }: CreateContextOptions) => {
  const session = await auth.api.getSession({
    headers: context.req.raw.headers,
  });
  return {
    auth: null,
    ch: createChClient(),
    session,
  };
};

export type Context = Awaited<ReturnType<typeof createContext>>;
