import {
  SidebarInset,
  SidebarProvider,
} from "@sbox-analytics/ui/components/sidebar";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { SiteHeader } from "@/components/dashboard/site-header";
import { authClient } from "@/lib/auth-client";

const DashboardLayout = () => (
  <SidebarProvider
    style={
      {
        "--header-height": "calc(var(--spacing) * 12)",
        "--sidebar-width": "calc(var(--spacing) * 72)",
      } as React.CSSProperties
    }
  >
    <AppSidebar variant="inset" />
    <SidebarInset>
      <SiteHeader />
      <div className="flex flex-1 flex-col">
        <div className="@container/main flex flex-1 flex-col gap-2">
          <Outlet />
        </div>
      </div>
    </SidebarInset>
  </SidebarProvider>
);

export const Route = createFileRoute("/dashboard")({
  beforeLoad: async () => {
    const session = await authClient.getSession();
    if (!session.data) {
      redirect({
        throw: true,
        to: "/login",
      });
    }
    const orgs = await authClient.organization.list();
    if (!orgs.data?.length) {
      redirect({
        throw: true,
        to: "/onboarding",
      });
    }
    return { session };
  },
  component: DashboardLayout,
});
