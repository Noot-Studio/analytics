# Organization Creation Flow — Design Spec

**Date:** 2026-05-27
**Status:** Approved

## Overview

Two surfaces for creating organizations, sharing a common form component:

1. A dedicated `/onboarding` page for first-time users with no organization
2. A `CreateOrgDrawer` accessible from the org-switcher dropdown for existing users

---

## Surfaces

### 1. Onboarding Page — `/routes/onboarding.tsx`

A full-page route shown to authenticated users who have no organizations.

**Guard logic:**

- `dashboard.tsx` `beforeLoad` already validates session. Extend it: if the user has a session but zero organizations, redirect to `/onboarding`.
- The `/onboarding` route itself redirects to `/dashboard` if the user already has at least one org (handles direct navigation and back-button cases).

**Page content:**

- Centered card layout with app branding
- Heading: "Create your organization"
- Uses `OrgForm` (see below)
- On successful submit: call `authClient.organization.create()`, then `authClient.organization.setActive()` with the new org's id, then `navigate({ to: '/dashboard' })`

---

### 2. Create Organization Drawer — `/components/dashboard/create-org-drawer.tsx`

A right-side drawer (bottom on mobile) triggered from the org-switcher dropdown.

**Props:**

```ts
interface CreateOrgDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}
```

**Behavior:**

- Uses the same `Drawer` pattern as `data-table.tsx`: `direction={isMobile ? "bottom" : "right"}`
- Contains `OrgForm` with a "Create Organization" submit label
- On success: call `authClient.organization.create()`, then `authClient.organization.setActive()`, then close drawer
- On cancel: close drawer, no side effects

**Integration in `org-switcher.tsx`:**

- Replace the current inline `authClient.organization.create()` call with state: `const [createOpen, setCreateOpen] = useState(false)`
- `DropdownMenuItem` onClick sets `createOpen = true`
- Render `<CreateOrgDrawer open={createOpen} onOpenChange={setCreateOpen} />` alongside the dropdown

---

### 3. Shared Form Component — `/components/dashboard/org-form.tsx`

Reused by both the onboarding page and the drawer.

**Props:**

```ts
interface OrgFormProps {
  onSubmit: (values: { name: string; slug: string }) => Promise<void>;
  isLoading: boolean;
  submitLabel?: string; // default: "Create Organization"
}
```

**Fields:**

- **Name** — required, min 2 characters
- **Slug** — required, alphanumeric + hyphens only (`/^[a-z0-9-]+$/`)

**Slug auto-generation:**

- Slug is derived from name: lowercase, spaces → hyphens, non-alphanumeric characters stripped
- Auto-updates from name until the user manually edits the slug field
- Once the slug is edited independently, it stops tracking the name

**Validation:** TanStack Form + Zod, matching the existing pattern in `login-form.tsx`

**Error handling:** Display field-level errors inline. Show a toast on API error (Sonner, matching existing pattern).

---

## Auth Guard Update — `/routes/dashboard.tsx`

Extend the existing `beforeLoad`:

```ts
// existing: redirect to /login if no session
// add: redirect to /onboarding if session exists but no organizations
const orgs = await authClient.listOrganizations();
if (orgs.data?.length === 0) {
  throw redirect({ to: "/onboarding" });
}
```

---

## File Summary

| File                                         | Action                                         |
| -------------------------------------------- | ---------------------------------------------- |
| `routes/onboarding.tsx`                      | Create — full-page onboarding route            |
| `routes/dashboard.tsx`                       | Edit — extend `beforeLoad` guard               |
| `components/dashboard/org-form.tsx`          | Create — shared name/slug form                 |
| `components/dashboard/create-org-drawer.tsx` | Create — drawer wrapper                        |
| `components/dashboard/org-switcher.tsx`      | Edit — trigger drawer instead of inline create |

---

## Out of Scope

- Organization editing or deletion
- Inviting members during onboarding
- Multi-step onboarding wizard
