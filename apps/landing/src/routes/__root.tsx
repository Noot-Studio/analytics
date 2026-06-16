import { HeadContent, Outlet, createRootRoute } from "@tanstack/react-router";

import "../index.css";

const RootComponent = () => (
  <>
    <HeadContent />
    <Outlet />
  </>
);

export const Route = createRootRoute({
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
        title: "Noot Analytics — Open-source analytics for s&box",
      },
      {
        content:
          "Open-source, real-time analytics for s&box games. See why players die, where maps fail, and how economies flow — self-host it or run it free in the cloud.",
        name: "description",
      },
    ],
  }),
});
