import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@sbox-analytics/ui/components/sidebar";
import { Link, useRouterState } from "@tanstack/react-router";
import { Fragment } from "react";

import type { NavItem } from "@/components/dashboard/nav-config";

const matchesPath = (pathname: string, url: string) =>
  pathname === url || pathname.startsWith(`${url}/`);

export const NavMain = ({ items }: { items: NavItem[] }) => {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  // The current page is the deepest item whose url prefixes the active path,
  // so a nested route never lights up its parent (e.g. "/dashboard").
  const activeUrl = items
    .map((item) => item.url)
    .filter((url) => matchesPath(pathname, url))
    .toSorted((a, b) => b.length - a.length)
    .at(0);

  return (
    <SidebarGroup>
      <SidebarGroupContent className="flex flex-col gap-2">
        <SidebarMenu>
          {items.map((item, index) => {
            const previousGroup =
              index > 0 ? items[index - 1].group : undefined;
            const showGroupLabel = item.group && item.group !== previousGroup;
            return (
              <Fragment key={item.title}>
                {showGroupLabel ? (
                  <SidebarGroupLabel className="mt-2">
                    {item.group}
                  </SidebarGroupLabel>
                ) : null}
                <SidebarMenuItem>
                  <SidebarMenuButton
                    render={<Link to={item.url} />}
                    tooltip={item.title}
                    variant={item.url === activeUrl ? "primary" : "default"}
                  >
                    {item.icon && <item.icon />}
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </Fragment>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
};
