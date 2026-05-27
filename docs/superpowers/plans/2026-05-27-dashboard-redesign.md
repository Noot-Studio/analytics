# Dashboard Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing home/dashboard/header with a shadcn dashboard-01 sidebar layout, add Better Auth organization switching, and wire up user dropdown with logout and settings navigation.

**Architecture:** Install the shadcn dashboard-01 block into the UI package, then copy and adapt the block components into the web app. The root route becomes a minimal provider shell. A new `/dashboard` layout route wraps all authenticated pages with the sidebar. Better Auth organization plugin provides org CRUD and switching.

**Tech Stack:** TanStack Router (file-based routes), shadcn/ui (base-lyra style), Better Auth (organization plugin), Prisma (PostgreSQL), recharts, @dnd-kit, @tanstack/react-table, @tabler/icons-react

---

### Task 1: Install shadcn UI components into the UI package

**Files:**

- Modify: `packages/ui/package.json` (new deps added automatically by shadcn CLI)
- Create: Multiple files under `packages/ui/src/components/` and `packages/ui/src/hooks/`

- [ ] **Step 1: Install required shadcn components**

Run from the `packages/ui` directory since that's where `components.json` lives:

```bash
cd packages/ui && bunx shadcn@latest add sidebar avatar badge chart table drawer tabs select toggle-group
```

This installs: sidebar, avatar, badge, chart, table (shadcn wrapper), drawer, tabs, select, toggle-group. It will also pull in transitive deps like `recharts`.

Components already present in the UI package (no need to install): button, card, checkbox, dropdown-menu, input, label, separator, skeleton, sonner.

- [ ] **Step 2: Verify the new components exist**

```bash
ls packages/ui/src/components/sidebar.tsx packages/ui/src/components/avatar.tsx packages/ui/src/components/badge.tsx packages/ui/src/components/chart.tsx packages/ui/src/components/table.tsx packages/ui/src/components/drawer.tsx packages/ui/src/components/tabs.tsx packages/ui/src/components/select.tsx packages/ui/src/components/toggle-group.tsx packages/ui/src/hooks/use-mobile.ts
```

All should exist. If `use-mobile.ts` was not created by the sidebar install, check `packages/ui/src/hooks/` and create it if missing.

- [ ] **Step 3: Update the UI package exports**

Edit `packages/ui/package.json` to ensure the hooks export exists:

```json
{
  "exports": {
    "./globals.css": "./src/styles/globals.css",
    "./lib/*": "./src/lib/*.ts",
    "./components/*": "./src/components/*.tsx",
    "./hooks/*": "./src/hooks/*.ts",
    "./postcss.config": "./postcss.config.mjs"
  }
}
```

The hooks export `"./hooks/*": "./src/hooks/*.ts"` should already be there. Verify it is.

- [ ] **Step 4: Commit**

```bash
git add packages/ui/
git commit -m "feat(ui): install shadcn sidebar, avatar, badge, chart, table, drawer, tabs, select, toggle-group components"
```

---

### Task 2: Install web app dependencies

**Files:**

- Modify: `apps/web/package.json`

- [ ] **Step 1: Install the new dependencies for dashboard-01**

```bash
cd apps/web && bun add @tabler/icons-react recharts @dnd-kit/core @dnd-kit/sortable @dnd-kit/modifiers @dnd-kit/utilities @tanstack/react-table
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/package.json bun.lock
git commit -m "feat(web): add dashboard-01 dependencies (tabler icons, recharts, dnd-kit, react-table)"
```

---

### Task 3: Add Better Auth organization plugin (server + client + Prisma)

**Files:**

- Modify: `packages/auth/src/index.ts`
- Modify: `apps/web/src/lib/auth-client.ts`
- Modify: `packages/db/prisma/schema/auth.prisma`

- [ ] **Step 1: Add organization plugin to Better Auth server**

Edit `packages/auth/src/index.ts`:

```ts
import { createPrismaClient } from "@sbox-analytics/db";
import { env } from "@sbox-analytics/env/server";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { organization } from "better-auth/plugins";

import { steam } from "./steam";

export function createAuth() {
  const prisma = createPrismaClient();

  return betterAuth({
    advanced: {
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "none",
        secure: true,
      },
    },

    baseURL: env.BETTER_AUTH_URL,

    database: prismaAdapter(prisma, {
      provider: "postgresql",
    }),

    emailAndPassword: {
      enabled: true,
    },

    plugins: [steam({ apiKey: env.STEAM_API_KEY }), organization()],

    secret: env.BETTER_AUTH_SECRET,

    trustedOrigins: [env.CORS_ORIGIN],
  });
}

export const auth = createAuth();
```

- [ ] **Step 2: Add organization client plugin to auth client**

Edit `apps/web/src/lib/auth-client.ts`:

```ts
import { env } from "@sbox-analytics/env/web";
import { createAuthClient } from "better-auth/react";
import { organizationClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: env.VITE_SERVER_URL,
  plugins: [organizationClient()],
});
```

- [ ] **Step 3: Add Prisma schema for organization tables**

Append to `packages/db/prisma/schema/auth.prisma`:

Add `activeOrganizationId` field to the `Session` model:

```prisma
model Session {
  id                   String   @id
  expiresAt            DateTime
  token                String
  createdAt            DateTime @default(now())
  updatedAt            DateTime @updatedAt
  ipAddress            String?
  userAgent            String?
  userId               String
  user                 User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  activeOrganizationId String?

  @@unique([token])
  @@index([userId])
  @@map("session")
}
```

Add `members` and `invitations` relations to the `User` model:

```prisma
model User {
  id            String    @id
  name          String
  email         String
  emailVerified Boolean   @default(false)
  image         String?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  sessions      Session[]
  accounts      Account[]
  projects      Project[]
  members       Member[]
  invitations   Invitation[]

  @@unique([email])
  @@map("user")
}
```

Add the three new models at the end of the file:

```prisma
model Organization {
  id        String   @id
  name      String
  slug      String   @unique
  logo      String?
  metadata  String?
  createdAt DateTime @default(now())

  members     Member[]
  invitations Invitation[]

  @@map("organization")
}

model Member {
  id             String       @id
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  userId         String
  user           User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  role           String
  createdAt      DateTime     @default(now())

  @@index([organizationId])
  @@index([userId])
  @@map("member")
}

model Invitation {
  id             String       @id
  email          String
  inviterId      String
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  role           String?
  status         String       @default("pending")
  expiresAt      DateTime
  createdAt      DateTime     @default(now())

  @@index([organizationId])
  @@map("invitation")
}
```

- [ ] **Step 4: Generate Prisma client**

```bash
bun run db:generate
```

Expected: Prisma client generates successfully with the new models.

- [ ] **Step 5: Push schema to database**

```bash
bun run db:push
```

Expected: Schema syncs to database. If the database is not running, this can be deferred.

- [ ] **Step 6: Commit**

```bash
git add packages/auth/src/index.ts apps/web/src/lib/auth-client.ts packages/db/prisma/schema/auth.prisma
git commit -m "feat(auth): add Better Auth organization plugin with Prisma schema"
```

---

### Task 4: Copy and adapt dashboard-01 block components

**Files:**

- Create: `apps/web/src/components/dashboard/app-sidebar.tsx`
- Create: `apps/web/src/components/dashboard/nav-main.tsx`
- Create: `apps/web/src/components/dashboard/nav-documents.tsx`
- Create: `apps/web/src/components/dashboard/nav-secondary.tsx`
- Create: `apps/web/src/components/dashboard/nav-user.tsx`
- Create: `apps/web/src/components/dashboard/org-switcher.tsx`
- Create: `apps/web/src/components/dashboard/site-header.tsx`
- Create: `apps/web/src/components/dashboard/section-cards.tsx`
- Create: `apps/web/src/components/dashboard/chart-area-interactive.tsx`
- Create: `apps/web/src/components/dashboard/data-table.tsx`
- Create: `apps/web/src/components/dashboard/data.json`

All components are adapted from the dashboard-01 block. Key adaptations applied to every file:

1. Remove `"use client"` directives
2. Remap imports from `@/registry/new-york-v4/ui/...` to `@sbox-analytics/ui/components/...`
3. Remap `@/registry/new-york-v4/hooks/use-mobile` to `@sbox-analytics/ui/hooks/use-mobile`
4. Remap block-internal imports to `@/components/dashboard/...`
5. Replace `<a href="#">` with `<Link to="...">` from `@tanstack/react-router` where navigation is needed

- [ ] **Step 1: Create the directory**

```bash
mkdir -p apps/web/src/components/dashboard
```

- [ ] **Step 2: Create `data.json`**

Copy the `data.json` from the dashboard-01 block as-is. This is a 68-row static JSON file used by the data table.

```bash
# Copy the full data.json from the block source
```

The file contains an array of objects with fields: `id`, `header`, `type`, `status`, `target`, `limit`, `reviewer`.

- [ ] **Step 3: Create `nav-main.tsx`**

```tsx
import { IconCirclePlusFilled, IconMail, type Icon } from "@tabler/icons-react";

import { Button } from "@sbox-analytics/ui/components/button";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@sbox-analytics/ui/components/sidebar";
import { Link } from "@tanstack/react-router";

export function NavMain({
  items,
}: {
  items: {
    title: string;
    url: string;
    icon?: Icon;
  }[];
}) {
  return (
    <SidebarGroup>
      <SidebarGroupContent className="flex flex-col gap-2">
        <SidebarMenu>
          <SidebarMenuItem className="flex items-center gap-2">
            <SidebarMenuButton
              tooltip="Quick Create"
              className="min-w-8 bg-primary text-primary-foreground duration-200 ease-linear hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground"
            >
              <IconCirclePlusFilled />
              <span>Quick Create</span>
            </SidebarMenuButton>
            <Button
              size="icon"
              className="size-8 group-data-[collapsible=icon]:opacity-0"
              variant="outline"
            >
              <IconMail />
              <span className="sr-only">Inbox</span>
            </Button>
          </SidebarMenuItem>
        </SidebarMenu>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton asChild tooltip={item.title}>
                <Link to={item.url}>
                  {item.icon && <item.icon />}
                  <span>{item.title}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
```

- [ ] **Step 4: Create `nav-documents.tsx`**

```tsx
import {
  IconDots,
  IconFolder,
  IconShare3,
  IconTrash,
  type Icon,
} from "@tabler/icons-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@sbox-analytics/ui/components/dropdown-menu";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@sbox-analytics/ui/components/sidebar";
import { Link } from "@tanstack/react-router";

export function NavDocuments({
  items,
}: {
  items: {
    name: string;
    url: string;
    icon: Icon;
  }[];
}) {
  const { isMobile } = useSidebar();

  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>Documents</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => (
          <SidebarMenuItem key={item.name}>
            <SidebarMenuButton asChild>
              <Link to={item.url}>
                <item.icon />
                <span>{item.name}</span>
              </Link>
            </SidebarMenuButton>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuAction
                  showOnHover
                  className="rounded-sm data-[state=open]:bg-accent"
                >
                  <IconDots />
                  <span className="sr-only">More</span>
                </SidebarMenuAction>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-24 rounded-lg"
                side={isMobile ? "bottom" : "right"}
                align={isMobile ? "end" : "start"}
              >
                <DropdownMenuItem>
                  <IconFolder />
                  <span>Open</span>
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <IconShare3 />
                  <span>Share</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive">
                  <IconTrash />
                  <span>Delete</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        ))}
        <SidebarMenuItem>
          <SidebarMenuButton className="text-sidebar-foreground/70">
            <IconDots className="text-sidebar-foreground/70" />
            <span>More</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroup>
  );
}
```

- [ ] **Step 5: Create `nav-secondary.tsx`**

```tsx
import type * as React from "react";
import { type Icon } from "@tabler/icons-react";

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@sbox-analytics/ui/components/sidebar";
import { Link } from "@tanstack/react-router";

export function NavSecondary({
  items,
  ...props
}: {
  items: {
    title: string;
    url: string;
    icon: Icon;
  }[];
} & React.ComponentPropsWithoutRef<typeof SidebarGroup>) {
  return (
    <SidebarGroup {...props}>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton asChild>
                <Link to={item.url}>
                  <item.icon />
                  <span>{item.title}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
```

- [ ] **Step 6: Create `nav-user.tsx`**

This version is wired to real auth session data and includes Log out + User Settings actions:

```tsx
import {
  IconDotsVertical,
  IconLogout,
  IconSettings,
} from "@tabler/icons-react";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@sbox-analytics/ui/components/avatar";
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
import { Link, useNavigate } from "@tanstack/react-router";

import { authClient } from "@/lib/auth-client";

export function NavUser() {
  const { isMobile } = useSidebar();
  const navigate = useNavigate();
  const { data: session } = authClient.useSession();

  const user = session?.user;

  if (!user) {
    return null;
  }

  const initials = user.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="h-8 w-8 rounded-lg grayscale">
                <AvatarImage src={user.image ?? undefined} alt={user.name} />
                <AvatarFallback className="rounded-lg">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{user.name}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {user.email}
                </span>
              </div>
              <IconDotsVertical className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarImage src={user.image ?? undefined} alt={user.name} />
                  <AvatarFallback className="rounded-lg">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{user.name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {user.email}
                  </span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem asChild>
                <Link to="/dashboard/settings">
                  <IconSettings />
                  User Settings
                </Link>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() => {
                authClient.signOut({
                  fetchOptions: {
                    onSuccess: () => {
                      navigate({ to: "/login" });
                    },
                  },
                });
              }}
            >
              <IconLogout />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
```

- [ ] **Step 7: Create `org-switcher.tsx`**

```tsx
import {
  IconBuilding,
  IconChevronDown,
  IconPlus,
  IconSettings,
} from "@tabler/icons-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@sbox-analytics/ui/components/dropdown-menu";
import { Skeleton } from "@sbox-analytics/ui/components/skeleton";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@sbox-analytics/ui/components/sidebar";
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
```

- [ ] **Step 8: Create `site-header.tsx`**

```tsx
import { Separator } from "@sbox-analytics/ui/components/separator";
import { SidebarTrigger } from "@sbox-analytics/ui/components/sidebar";

import { ModeToggle } from "@/components/mode-toggle";

export function SiteHeader() {
  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mx-2 data-[orientation=vertical]:h-4"
        />
        <h1 className="text-base font-medium">Dashboard</h1>
        <div className="ml-auto flex items-center gap-2">
          <ModeToggle />
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 9: Create `section-cards.tsx`**

Copy from the block source with import paths remapped:

```tsx
import { IconTrendingDown, IconTrendingUp } from "@tabler/icons-react";

import { Badge } from "@sbox-analytics/ui/components/badge";
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@sbox-analytics/ui/components/card";

export function SectionCards() {
  return (
    <div className="grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-4 dark:*:data-[slot=card]:bg-card">
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Total Revenue</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            $1,250.00
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <IconTrendingUp />
              +12.5%
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Trending up this month <IconTrendingUp className="size-4" />
          </div>
          <div className="text-muted-foreground">
            Visitors for the last 6 months
          </div>
        </CardFooter>
      </Card>
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>New Customers</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            1,234
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <IconTrendingDown />
              -20%
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Down 20% this period <IconTrendingDown className="size-4" />
          </div>
          <div className="text-muted-foreground">
            Acquisition needs attention
          </div>
        </CardFooter>
      </Card>
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Active Accounts</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            45,678
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <IconTrendingUp />
              +12.5%
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Strong user retention <IconTrendingUp className="size-4" />
          </div>
          <div className="text-muted-foreground">Engagement exceed targets</div>
        </CardFooter>
      </Card>
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Growth Rate</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            4.5%
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <IconTrendingUp />
              +4.5%
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Steady performance increase <IconTrendingUp className="size-4" />
          </div>
          <div className="text-muted-foreground">Meets growth projections</div>
        </CardFooter>
      </Card>
    </div>
  );
}
```

- [ ] **Step 10: Create `chart-area-interactive.tsx`**

Copy from the block source with import paths remapped. Remove `"use client"`. Change:

- `@/registry/new-york-v4/hooks/use-mobile` to `@sbox-analytics/ui/hooks/use-mobile`
- `@/registry/new-york-v4/ui/card` to `@sbox-analytics/ui/components/card`
- `@/registry/new-york-v4/ui/chart` to `@sbox-analytics/ui/components/chart`
- `@/registry/new-york-v4/ui/select` to `@sbox-analytics/ui/components/select`
- `@/registry/new-york-v4/ui/toggle-group` to `@sbox-analytics/ui/components/toggle-group`

Keep all the chart data and component logic identical.

- [ ] **Step 11: Create `data-table.tsx`**

Copy from the block source with import paths remapped. Remove `"use client"`. Change:

- `@/registry/new-york-v4/hooks/use-mobile` to `@sbox-analytics/ui/hooks/use-mobile`
- All `@/registry/new-york-v4/ui/...` to `@sbox-analytics/ui/components/...`

Keep all the table logic, drag-and-drop, drawer detail view, and pagination identical.

- [ ] **Step 12: Create `app-sidebar.tsx`**

This assembles all nav sections with the org switcher replacing the "Acme Inc." header:

```tsx
import type * as React from "react";
import {
  IconChartBar,
  IconDashboard,
  IconDatabase,
  IconFileWord,
  IconHelp,
  IconReport,
  IconSearch,
  IconSettings,
  IconUsers,
} from "@tabler/icons-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
} from "@sbox-analytics/ui/components/sidebar";

import { NavDocuments } from "@/components/dashboard/nav-documents";
import { NavMain } from "@/components/dashboard/nav-main";
import { NavSecondary } from "@/components/dashboard/nav-secondary";
import { NavUser } from "@/components/dashboard/nav-user";
import { OrgSwitcher } from "@/components/dashboard/org-switcher";

const data = {
  navMain: [
    { title: "Dashboard", url: "/dashboard", icon: IconDashboard },
    { title: "Analytics", url: "/dashboard", icon: IconChartBar },
    { title: "Team", url: "/dashboard", icon: IconUsers },
  ],
  navSecondary: [
    { title: "Settings", url: "/dashboard/settings", icon: IconSettings },
    { title: "Get Help", url: "/dashboard", icon: IconHelp },
    { title: "Search", url: "/dashboard", icon: IconSearch },
  ],
  documents: [
    { name: "Data Library", url: "/dashboard", icon: IconDatabase },
    { name: "Reports", url: "/dashboard", icon: IconReport },
    { name: "Word Assistant", url: "/dashboard", icon: IconFileWord },
  ],
};

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <OrgSwitcher />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
        <NavDocuments items={data.documents} />
        <NavSecondary items={data.navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  );
}
```

- [ ] **Step 13: Commit**

```bash
git add apps/web/src/components/dashboard/
git commit -m "feat(web): add adapted dashboard-01 block components with org switcher and auth-wired nav-user"
```

---

### Task 5: Update routes — dashboard layout, index, settings, organization, root redirect

**Files:**

- Modify: `apps/web/src/routes/__root.tsx`
- Create: `apps/web/src/routes/dashboard.tsx` (layout route)
- Create: `apps/web/src/routes/dashboard/index.tsx`
- Create: `apps/web/src/routes/dashboard/settings.tsx`
- Create: `apps/web/src/routes/dashboard/organization.tsx`
- Modify: `apps/web/src/routes/index.tsx` (redirect to /dashboard)
- Delete: `apps/web/src/components/header.tsx`
- Delete: `apps/web/src/components/user-menu.tsx`

- [ ] **Step 1: Update `__root.tsx` — remove Header, keep providers only**

```tsx
import { Toaster } from "@sbox-analytics/ui/components/sonner";
import {
  HeadContent,
  Outlet,
  createRootRouteWithContext,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import type { QueryClient } from "@tanstack/react-query";

import { ThemeProvider } from "@/components/theme-provider";
import type { orpc } from "@/utils/orpc";

import "../index.css";

export interface RouterAppContext {
  orpc: typeof orpc;
  queryClient: QueryClient;
}

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

function RootComponent() {
  return (
    <>
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
    </>
  );
}
```

Key changes: removed `Header` import and the `<div className="grid grid-rows-[auto_1fr] h-svh">` wrapper. Also removed unused `useState`, `createORPCClient`, `createTanstackQueryUtils`, `RPCLink`, and `link` imports.

- [ ] **Step 2: Update `routes/index.tsx` — redirect to /dashboard**

```tsx
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    redirect({
      throw: true,
      to: "/dashboard",
    });
  },
  component: () => null,
});
```

- [ ] **Step 3: Create `routes/dashboard.tsx` — layout route with auth guard**

This file must be named `dashboard.tsx` (not `dashboard/route.tsx`) so TanStack Router treats it as a layout route for `/dashboard/*`.

```tsx
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { SiteHeader } from "@/components/dashboard/site-header";
import {
  SidebarInset,
  SidebarProvider,
} from "@sbox-analytics/ui/components/sidebar";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/dashboard")({
  beforeLoad: async () => {
    const session = await authClient.getSession();
    if (!session.data) {
      redirect({
        throw: true,
        to: "/login",
      });
    }
    return { session };
  },
  component: DashboardLayout,
});

function DashboardLayout() {
  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 72)",
          "--header-height": "calc(var(--spacing) * 12)",
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
}
```

- [ ] **Step 4: Create `routes/dashboard/index.tsx` — main dashboard content**

```tsx
import { createFileRoute } from "@tanstack/react-router";

import { ChartAreaInteractive } from "@/components/dashboard/chart-area-interactive";
import { DataTable } from "@/components/dashboard/data-table";
import { SectionCards } from "@/components/dashboard/section-cards";

import data from "@/components/dashboard/data.json";

export const Route = createFileRoute("/dashboard/")({
  component: DashboardIndex,
});

function DashboardIndex() {
  return (
    <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
      <SectionCards />
      <div className="px-4 lg:px-6">
        <ChartAreaInteractive />
      </div>
      <DataTable data={data} />
    </div>
  );
}
```

- [ ] **Step 5: Create `routes/dashboard/settings.tsx` — user settings placeholder**

```tsx
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <div className="flex flex-col gap-4 p-4 lg:p-6">
      <h1 className="text-2xl font-semibold">User Settings</h1>
      <p className="text-muted-foreground">
        User settings will be available here.
      </p>
    </div>
  );
}
```

- [ ] **Step 6: Create `routes/dashboard/organization.tsx` — org settings placeholder**

```tsx
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/organization")({
  component: OrganizationPage,
});

function OrganizationPage() {
  return (
    <div className="flex flex-col gap-4 p-4 lg:p-6">
      <h1 className="text-2xl font-semibold">Organization Settings</h1>
      <p className="text-muted-foreground">
        Organization management will be available here.
      </p>
    </div>
  );
}
```

- [ ] **Step 7: Delete old components**

```bash
rm apps/web/src/components/header.tsx apps/web/src/components/user-menu.tsx
```

- [ ] **Step 8: Run the route codegen**

TanStack Router auto-generates `routeTree.gen.ts`. Running the dev server or build triggers this:

```bash
cd apps/web && bunx tsr generate
```

If `tsr` is not available as a standalone command, just run `bun run dev` briefly to trigger the route codegen, or the build will handle it.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/routes/ apps/web/src/routeTree.gen.ts
git add -u apps/web/src/components/header.tsx apps/web/src/components/user-menu.tsx
git commit -m "feat(web): replace home/dashboard/header with sidebar layout, add org/settings routes"
```

---

### Task 6: Verify the app builds and runs

**Files:** None (verification only)

- [ ] **Step 1: Run type checking**

```bash
bun run check-types
```

Expected: No type errors. If there are errors, fix them — likely import path mismatches or missing component exports from the UI package.

- [ ] **Step 2: Run the linter**

```bash
bun run check
```

Expected: No lint errors. If there are Ultracite issues, run `bun run fix` to auto-fix.

- [ ] **Step 3: Start the dev server**

```bash
bun run dev:web
```

Expected: Vite dev server starts on port 3001. Navigate to `http://localhost:3001`. You should be redirected to `/login` (if not authenticated) or `/dashboard` (if authenticated). The sidebar layout should be visible with:

- Org switcher in the sidebar header
- Navigation links in the sidebar
- User menu in the sidebar footer with Log out and User Settings
- KPI cards, chart, and data table in the main content area

- [ ] **Step 4: Fix any issues found during manual testing**

Common issues to check:

- Sidebar collapses correctly on mobile
- Theme toggle works in the site header
- Navigation links work (Dashboard, Settings, Organization)
- User dropdown shows session data and Log out works
- Org switcher displays (may show empty list if no orgs exist yet)

- [ ] **Step 5: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix(web): address build/runtime issues from dashboard redesign"
```
