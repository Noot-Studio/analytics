import { Button } from "@sbox-analytics/ui/components/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@sbox-analytics/ui/components/table";
import { UserMinus } from "lucide-react";
import { useState } from "react";

import { UserAvatar } from "@/components/user-avatar";

import { RoleBadge } from "../atoms/role-badge";
import { RemoveMemberDialog } from "./remove-member-dialog";

export interface TeamMember {
  id: string;
  userId: string;
  role: string;
  createdAt: Date | string;
  user: {
    name: string;
    email: string;
    image?: string | null;
  };
}

const formatJoinedDate = (date: Date | string) =>
  new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(
    new Date(date)
  );

interface TeamMembersTableProps {
  members: TeamMember[];
  currentUserId: string;
  canManage: boolean;
  onRemove: (memberId: string) => void;
  removePending: boolean;
}

const MemberRemoveAction = ({
  isPending,
  member,
  onRemove,
}: {
  member: TeamMember;
  onRemove: (memberId: string) => void;
  isPending: boolean;
}) => {
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <>
      <Button
        aria-label={`Remove ${member.user.name} from the organization`}
        onClick={() => setConfirmOpen(true)}
        size="icon"
        variant="ghost"
      >
        <UserMinus className="size-4" />
      </Button>
      <RemoveMemberDialog
        isPending={isPending}
        memberName={member.user.name}
        onConfirm={() => onRemove(member.id)}
        onOpenChange={setConfirmOpen}
        open={confirmOpen}
      />
    </>
  );
};

export const TeamMembersTable = ({
  canManage,
  currentUserId,
  members,
  onRemove,
  removePending,
}: TeamMembersTableProps) => (
  <div className="rounded-lg border">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Member</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Joined</TableHead>
          {canManage ? (
            <TableHead>
              <span className="sr-only">Actions</span>
            </TableHead>
          ) : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {members.map((member) => (
          <TableRow key={member.id}>
            <TableCell>
              <div className="flex items-center gap-3">
                <UserAvatar
                  image={member.user.image}
                  name={member.user.name}
                  seed={member.user.email}
                />
                <div className="flex flex-col">
                  <span className="font-medium">
                    {member.user.name}
                    {member.userId === currentUserId ? (
                      <span className="text-muted-foreground"> (you)</span>
                    ) : null}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {member.user.email}
                  </span>
                </div>
              </div>
            </TableCell>
            <TableCell>
              <RoleBadge role={member.role} />
            </TableCell>
            <TableCell className="text-muted-foreground">
              {formatJoinedDate(member.createdAt)}
            </TableCell>
            {canManage ? (
              <TableCell>
                <div className="flex justify-end">
                  {member.userId !== currentUserId &&
                  member.role !== "owner" ? (
                    <MemberRemoveAction
                      isPending={removePending}
                      member={member}
                      onRemove={onRemove}
                    />
                  ) : null}
                </div>
              </TableCell>
            ) : null}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </div>
);
