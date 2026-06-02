import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import type { AppRouterClient } from "@sbox-analytics/api/routers/index";
import { env } from "@sbox-analytics/env/web";
import {
  keepPreviousData,
  QueryCache,
  QueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";

export const queryClient = new QueryClient({
  // Keep the previous result visible while a query with new params refetches, so
  // changing a filter/sort/page never drops the view back to its loading state.
  defaultOptions: {
    queries: {
      // Keep tab data resident long enough that switching around a project never
      // re-cold-loads within a session.
      gcTime: 30 * 60 * 1000,
      placeholderData: keepPreviousData,
      // A visited page's data stays "fresh" for a minute: route loaders warm the
      // cache on hover/intent, and navigating back to a tab serves that cache
      // instantly with no refetch — no loading state, no skeleton flash.
      staleTime: 60 * 1000,
    },
  },
  queryCache: new QueryCache({
    onError: (error, query) => {
      toast.error(`Error: ${error.message}`, {
        action: {
          label: "retry",
          onClick: query.invalidate,
        },
      });
    },
  }),
});

export const link = new RPCLink({
  fetch(url, options) {
    return fetch(url, {
      ...options,
      credentials: "include",
    });
  },
  url: `${env.VITE_SERVER_URL}/rpc`,
});

export const client: AppRouterClient = createORPCClient(link);

export const orpc = createTanstackQueryUtils(client);
