import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@sbox-analytics/ui/components/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@sbox-analytics/ui/components/sidebar";
import { Skeleton } from "@sbox-analytics/ui/components/skeleton";
import {
  IconBuilding,
  IconChevronDown,
  IconPlus,
  IconSettings,
} from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";

import { authClient } from "@/lib/auth-client";

export function OrgSwitcher() {
  const { isMobile } = useSidebar();
  const { data: organizations, isPending: isLoadingOrgs } =
    authClient.useListOrganizations();
  const { data: activeOrg, isPending: isLoadingActive } =
    authClient.useActiveOrganization();

  if (isLoadingOrgs || isLoadingActive) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <Skeleton className="h-8 w-full" />
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <IconBuilding className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">
                  {activeOrg?.name ?? "Select Organization"}
                </span>
                {activeOrg?.slug && (
                  <span className="truncate text-xs text-muted-foreground">
                    {activeOrg.slug}
                  </span>
                )}
              </div>
              <IconChevronDown className="ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            align="start"
            side={isMobile ? "bottom" : "right"}
            sideOffset={4}
          >
            <DropdownMenuLabel>Organizations</DropdownMenuLabel>
            {organizations?.map((org) => (
              <DropdownMenuItem
                key={org.id}
                onClick={() => {
                  authClient.organization.setActive({
                    organizationId: org.id,
                  });
                }}
              >
                <IconBuilding className="mr-2 size-4" />
                <span className="truncate">{org.name}</span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/dashboard/organization">
                <IconSettings className="mr-2 size-4" />
                Organization Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                authClient.organization.create({
                  name: "New Organization",
                  slug: `org-${Date.now()}`,
                });
              }}
            >
              <IconPlus className="mr-2 size-4" />
              Create Organization
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
