# Dashboard Redesign with Organization Support

## Overview

Replace the existing home page, dashboard, and header layout with the shadcn `dashboard-01` block adapted for TanStack Router + Vite. Add Better Auth organization switching, proper navigation, and a user dropdown with logout and settings.

## Route Structure

```
/login                      — public, no sidebar (existing, unchanged)
/dashboard                  — layout route: sidebar + SidebarInset wrapper, auth guard
/dashboard/                 — index: KPI cards, interactive chart, data table (dashboard-01 content)
/dashboard/settings         — user settings (placeholder page)
/dashboard/organization     — organization settings (placeholder page)
```

- The root route (`__root.tsx`) becomes a minimal shell: providers + `<Outlet>`. No header.
- `/` redirects to `/dashboard` (or `/login` if unauthenticated).
- The auth guard lives in the `/dashboard` layout route's `beforeLoad`, redirecting to `/login` if no session.

## Sidebar Layout (from dashboard-01)

### Structure

```
Sidebar
├── SidebarHeader        → Organization switcher dropdown
├── SidebarContent
│   ├── NavMain          → Dashboard, Analytics, Projects, Team
│   ├── NavDocuments     → (can be removed or repurposed later)
│   └── NavSecondary     → Settings, Get Help, Search (mt-auto)
└── SidebarFooter
    └── NavUser          → Avatar, name, email, dropdown menu
```

### Organization Switcher (SidebarHeader)

Replaces the static "Acme Inc." logo. Uses a dropdown showing:

- Current active organization name + logo
- List of user's organizations from `authClient.useListOrganizations()`
- Clicking an org calls `authClient.organization.setActive({ organizationId })`
- "Organization Settings" link → `/dashboard/organization`
- "Create Organization" action (inline or modal)

### NavUser Dropdown (SidebarFooter)

Populated from `authClient.useSession()`:

- Avatar, name, email display
- **User Settings** → navigates to `/dashboard/settings`
- **Log out** → `authClient.signOut()`, redirects to `/login`

### Navigation Items

NavMain links use TanStack Router `<Link>` components with `to` props instead of `<a href="#">`. Initial nav:

- Dashboard → `/dashboard`
- Analytics → `/dashboard` (same page for now)
- Settings → `/dashboard/settings`
- Organization → `/dashboard/organization`

## Backend Changes

### Better Auth Server Plugin

Add `organization()` plugin to `packages/auth/src/index.ts`:

```ts
import { organization } from "better-auth/plugins";

// In betterAuth config:
plugins: [steam({ apiKey: env.STEAM_API_KEY }), organization()],
```

### Better Auth Client Plugin

Add `organizationClient()` to `apps/web/src/lib/auth-client.ts`:

```ts
import { organizationClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: env.VITE_SERVER_URL,
  plugins: [organizationClient()],
});
```

### Prisma Schema Additions

New models in `packages/db/prisma/schema/auth.prisma`:

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

Session model addition:

```prisma
activeOrganizationId String?
```

User model additions (relations):

```prisma
members     Member[]
invitations Invitation[]
```

## Files to Remove

- `apps/web/src/routes/index.tsx` — replaced by redirect to /dashboard
- `apps/web/src/components/header.tsx` — replaced by sidebar layout
- `apps/web/src/components/user-menu.tsx` — replaced by nav-user in sidebar

## New shadcn UI Components

Install into `packages/ui` via the UI package's `components.json`:

- sidebar
- avatar
- badge
- chart
- table (shadcn table, distinct from @tanstack/react-table)
- drawer
- tabs
- select
- toggle-group

Already present: button, card, checkbox, dropdown-menu, input, label, separator, skeleton, sonner

## New Dependencies (apps/web)

- `@tabler/icons-react` — icons used throughout dashboard-01
- `recharts` — chart library (used by shadcn chart components)
- `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/modifiers`, `@dnd-kit/utilities` — drag-and-drop for data table
- `@tanstack/react-table` — table engine for data table

## Dashboard Components (apps/web)

New files under `apps/web/src/components/dashboard/`:

| File                         | Source       | Adaptations                                                          |
| ---------------------------- | ------------ | -------------------------------------------------------------------- |
| `app-sidebar.tsx`            | dashboard-01 | Remove "use client", use real nav data, org switcher, real user data |
| `nav-main.tsx`               | dashboard-01 | TanStack Router `<Link>` instead of `<a>`                            |
| `nav-documents.tsx`          | dashboard-01 | TanStack Router links                                                |
| `nav-secondary.tsx`          | dashboard-01 | TanStack Router links                                                |
| `nav-user.tsx`               | dashboard-01 | Real session data, logout action, settings link                      |
| `org-switcher.tsx`           | new          | Organization switching dropdown using Better Auth hooks              |
| `site-header.tsx`            | dashboard-01 | Minor adaptations                                                    |
| `section-cards.tsx`          | dashboard-01 | As-is (static data for now)                                          |
| `chart-area-interactive.tsx` | dashboard-01 | Remove "use client"                                                  |
| `data-table.tsx`             | dashboard-01 | Remove "use client"                                                  |

## Adaptation Checklist

1. Remove all `"use client"` directives (7 files)
2. Replace `<a href="#">` with `<Link to="...">` from `@tanstack/react-router`
3. Remap imports from `@/registry/new-york-v4/ui/...` to `@sbox-analytics/ui/components/...`
4. Remap block component imports to `@/components/dashboard/...`
5. Wire NavUser to real auth session
6. Wire org switcher to Better Auth organization hooks
7. Add auth guard to dashboard layout route
