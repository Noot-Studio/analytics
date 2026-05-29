import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
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
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { CreateOrgDrawer } from "@/features/org/components/organisms/create-org-drawer";
import { authClient } from "@/lib/auth-client";

export const OrgSwitcher = () => {
  const { isMobile } = useSidebar();
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);
  const { data: organizations, isPending: isLoadingOrgs } =
    authClient.useListOrganizations();
  const { data: activeOrg, isPending: isLoadingActive } =
    authClient.useActiveOrganization();

  // On sign-in no organization is active yet — default to the first one.
  useEffect(() => {
    if (isLoadingOrgs || isLoadingActive || activeOrg) {
      return;
    }
    const firstOrg = organizations?.[0];
    if (firstOrg) {
      authClient.organization.setActive({ organizationId: firstOrg.id });
    }
  }, [isLoadingOrgs, isLoadingActive, activeOrg, organizations]);

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
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                />
              }
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
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
              align="start"
              side={isMobile ? "bottom" : "right"}
              sideOffset={4}
            >
              <DropdownMenuGroup>
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
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem
                  onClick={() => navigate({ to: "/dashboard/organization" })}
                >
                  <IconSettings className="mr-2 size-4" />
                  Organization Settings
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setCreateOpen(true)}>
                  <IconPlus className="mr-2 size-4" />
                  Create Organization
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>
      <CreateOrgDrawer open={createOpen} onOpenChange={setCreateOpen} />
    </>
  );
};
