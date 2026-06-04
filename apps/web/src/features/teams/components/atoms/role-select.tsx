import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@sbox-analytics/ui/components/select";

export type InvitableRole = "admin" | "member";

const ROLE_ITEMS: Record<InvitableRole, string> = {
  admin: "Admin",
  member: "Member",
};

interface RoleSelectProps {
  id?: string;
  value: InvitableRole;
  onValueChange: (role: InvitableRole) => void;
}

export const RoleSelect = ({ id, onValueChange, value }: RoleSelectProps) => (
  <Select
    items={ROLE_ITEMS}
    onValueChange={(next) => next && onValueChange(next as InvitableRole)}
    value={value}
  >
    <SelectTrigger className="w-full" id={id}>
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      {Object.entries(ROLE_ITEMS).map(([role, label]) => (
        <SelectItem key={role} value={role}>
          {label}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
);
