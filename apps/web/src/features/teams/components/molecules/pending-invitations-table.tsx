import { Button } from "@sbox-analytics/ui/components/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@sbox-analytics/ui/components/table";
import { Copy, X } from "lucide-react";
import { toast } from "sonner";

import { RoleBadge } from "../atoms/role-badge";

export interface PendingInvitation {
  id: string;
  email: string;
  role?: string | null;
  expiresAt: Date | string;
}

const formatExpiry = (date: Date | string) =>
  new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(date));

const copyAcceptLink = async (invitationId: string) => {
  const url = `${window.location.origin}/accept-invitation/${invitationId}`;
  await navigator.clipboard.writeText(url);
  toast.success("Invitation link copied");
};

interface PendingInvitationsTableProps {
  invitations: PendingInvitation[];
  onCancel: (invitationId: string) => void;
  cancelPending: boolean;
}

export const PendingInvitationsTable = ({
  cancelPending,
  invitations,
  onCancel,
}: PendingInvitationsTableProps) => (
  <div className="rounded-lg border">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Email</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Expires</TableHead>
          <TableHead>
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {invitations.map((invitation) => (
          <TableRow key={invitation.id}>
            <TableCell className="font-medium">{invitation.email}</TableCell>
            <TableCell>
              <RoleBadge role={invitation.role ?? "member"} />
            </TableCell>
            <TableCell className="text-muted-foreground">
              {formatExpiry(invitation.expiresAt)}
            </TableCell>
            <TableCell>
              <div className="flex justify-end gap-1">
                <Button
                  aria-label={`Copy invitation link for ${invitation.email}`}
                  onClick={() => copyAcceptLink(invitation.id)}
                  size="icon"
                  variant="ghost"
                >
                  <Copy className="size-4" />
                </Button>
                <Button
                  aria-label={`Cancel invitation for ${invitation.email}`}
                  disabled={cancelPending}
                  onClick={() => onCancel(invitation.id)}
                  size="icon"
                  variant="ghost"
                >
                  <X className="size-4" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </div>
);
