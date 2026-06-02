import { Toaster } from "@sbox-analytics/ui/components/sonner";
import type { QueryClient } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import {
  HeadContent,
  Outlet,
  createRootRouteWithContext,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { NuqsAdapter } from "nuqs/adapters/tanstack-router";

import { ThemeProvider } from "@/components/theme-provider";
import type { orpc } from "@/utils/orpc";

import "../index.css";

export interface RouterAppContext {
  orpc: typeof orpc;
  queryClient: QueryClient;
}

const RootComponent = () => (
  <NuqsAdapter>
    <HeadContent />
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      disableTransitionOnChange
      storageKey="vite-ui-theme"
    >
      <Outlet />
      <Toaster richColors />
    </ThemeProvider>
    <TanStackRouterDevtools position="bottom-left" />
    <ReactQueryDevtools position="bottom" buttonPosition="bottom-right" />
  </NuqsAdapter>
);

export const Route = createRootRouteWithContext<RouterAppContext>()({
  component: RootComponent,
  head: () => ({
    links: [
      {
        href: "/favicon.ico",
        rel: "icon",
      },
    ],
    meta: [
      {
        title: "sbox-analytics",
      },
      {
        content: "sbox-analytics is a web application",
        name: "description",
      },
    ],
  }),
});
