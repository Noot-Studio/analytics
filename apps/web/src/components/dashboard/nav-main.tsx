import { Button } from "@sbox-analytics/ui/components/button";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@sbox-analytics/ui/components/sidebar";
import { IconCirclePlusFilled, IconMail } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import { Fragment } from "react";

import type { NavItem } from "@/components/dashboard/nav-config";

export function NavMain({ items }: { items: NavItem[] }) {
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
}
