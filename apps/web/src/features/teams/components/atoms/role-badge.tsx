import { Badge } from "@sbox-analytics/ui/components/badge";

const ROLE_VARIANTS: Record<
  string,
  React.ComponentProps<typeof Badge>["variant"]
> = {
  admin: "secondary",
  member: "outline",
  owner: "default",
};

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  member: "Member",
  owner: "Owner",
};

export const RoleBadge = ({ role }: { role: string }) => (
  <Badge variant={ROLE_VARIANTS[role] ?? "outline"}>
    {ROLE_LABELS[role] ?? role}
  </Badge>
);
