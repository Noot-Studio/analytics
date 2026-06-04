import { Button } from "@sbox-analytics/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@sbox-analytics/ui/components/dialog";
import { DotmSquare4 } from "@sbox-analytics/ui/components/dotm-square-4";
import { Input } from "@sbox-analytics/ui/components/input";
import { Label } from "@sbox-analytics/ui/components/label";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@sbox-analytics/ui/components/tabs";
import { Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import type { InvitableRole } from "../atoms/role-select";
import { RoleSelect } from "../atoms/role-select";

export interface CreateUserInput {
  name: string;
  email: string;
  password: string;
  role: InvitableRole;
}

interface InviteMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Email invitations need a configured email provider on the server. */
  emailInvitesAvailable: boolean;
  onInviteEmail: (email: string, role: InvitableRole) => void;
  inviteEmailPending: boolean;
  onCreateLink: (role: InvitableRole) => void;
  createLinkPending: boolean;
  createdLink: string | null;
  onCreateUser: (input: CreateUserInput) => void;
  createUserPending: boolean;
}

const PendingLabel = ({
  label,
  pending,
}: {
  label: string;
  pending: boolean;
}) =>
  pending ? (
    <DotmSquare4 ariaLabel={label} dotSize={2} size={18} />
  ) : (
    <>{label}</>
  );

const copyToClipboard = async (value: string) => {
  await navigator.clipboard.writeText(value);
  toast.success("Invite link copied");
};

export const InviteMemberDialog = ({
  createdLink,
  createLinkPending,
  createUserPending,
  emailInvitesAvailable,
  inviteEmailPending,
  onCreateLink,
  onCreateUser,
  onInviteEmail,
  onOpenChange,
  open,
}: InviteMemberDialogProps) => {
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<InvitableRole>("member");
  const [linkRole, setLinkRole] = useState<InvitableRole>("member");
  const [newUser, setNewUser] = useState({
    email: "",
    name: "",
    password: "",
  });
  const [newUserRole, setNewUserRole] = useState<InvitableRole>("member");

  const handleClose = (next: boolean) => {
    if (!next) {
      setInviteEmail("");
      setNewUser({ email: "", name: "", password: "" });
    }
    onOpenChange(next);
  };

  const handleInviteSubmit = (e: { preventDefault(): void }) => {
    e.preventDefault();
    if (inviteEmail.trim()) {
      onInviteEmail(inviteEmail.trim(), inviteRole);
    }
  };

  const canCreateUser =
    newUser.name.trim() && newUser.email.trim() && newUser.password.length >= 8;

  const handleCreateUserSubmit = (e: { preventDefault(): void }) => {
    e.preventDefault();
    if (canCreateUser) {
      onCreateUser({
        email: newUser.email.trim(),
        name: newUser.name.trim(),
        password: newUser.password,
        role: newUserRole,
      });
    }
  };

  const emailPanel = (
    <form className="flex flex-col gap-4 py-2" onSubmit={handleInviteSubmit}>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="invite-email">Email</Label>
        <Input
          id="invite-email"
          onChange={(e) => setInviteEmail(e.target.value)}
          placeholder="teammate@example.com"
          type="email"
          value={inviteEmail}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="invite-role">Role</Label>
        <RoleSelect
          id="invite-role"
          onValueChange={setInviteRole}
          value={inviteRole}
        />
      </div>
      <Button
        disabled={inviteEmailPending || !inviteEmail.trim()}
        type="submit"
      >
        <PendingLabel label="Send invitation" pending={inviteEmailPending} />
      </Button>
    </form>
  );

  const linkPanel = (
    <div className="flex flex-col gap-4 py-2">
      <p className="text-muted-foreground text-sm">
        Anyone with this link can join your organization with the selected role.
        Links expire after 7 days.
      </p>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="link-role">Role</Label>
        <RoleSelect
          id="link-role"
          onValueChange={setLinkRole}
          value={linkRole}
        />
      </div>
      {createdLink ? (
        <div className="flex items-center gap-2">
          <Input
            aria-label="Invite link"
            className="font-mono text-xs"
            readOnly
            value={createdLink}
          />
          <Button
            aria-label="Copy invite link"
            onClick={() => copyToClipboard(createdLink)}
            size="icon"
            type="button"
            variant="outline"
          >
            <Copy className="size-4" />
          </Button>
        </div>
      ) : null}
      <Button
        disabled={createLinkPending}
        onClick={() => onCreateLink(linkRole)}
        type="button"
      >
        <PendingLabel
          label={createdLink ? "Generate new link" : "Generate link"}
          pending={createLinkPending}
        />
      </Button>
    </div>
  );

  const createPanel = (
    <form
      className="flex flex-col gap-4 py-2"
      onSubmit={handleCreateUserSubmit}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="new-user-name">Name</Label>
        <Input
          id="new-user-name"
          onChange={(e) =>
            setNewUser((prev) => ({ ...prev, name: e.target.value }))
          }
          placeholder="Jane Doe"
          value={newUser.name}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="new-user-email">Email</Label>
        <Input
          id="new-user-email"
          onChange={(e) =>
            setNewUser((prev) => ({ ...prev, email: e.target.value }))
          }
          placeholder="teammate@example.com"
          type="email"
          value={newUser.email}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="new-user-password">Temporary password</Label>
        <Input
          id="new-user-password"
          onChange={(e) =>
            setNewUser((prev) => ({ ...prev, password: e.target.value }))
          }
          placeholder="At least 8 characters"
          type="password"
          value={newUser.password}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="new-user-role">Role</Label>
        <RoleSelect
          id="new-user-role"
          onValueChange={setNewUserRole}
          value={newUserRole}
        />
      </div>
      <Button disabled={createUserPending || !canCreateUser} type="submit">
        <PendingLabel label="Create account" pending={createUserPending} />
      </Button>
    </form>
  );

  // Only offer methods the server can actually fulfill.
  const methods = [
    ...(emailInvitesAvailable
      ? [{ content: emailPanel, label: "Email", value: "email" }]
      : []),
    { content: linkPanel, label: "Invite link", value: "link" },
    { content: createPanel, label: "New user", value: "create" },
  ];

  return (
    <Dialog onOpenChange={handleClose} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite to your team</DialogTitle>
          <DialogDescription>
            Add a teammate to your organization.
          </DialogDescription>
        </DialogHeader>

        {methods.length === 1 ? (
          methods[0].content
        ) : (
          <Tabs defaultValue={methods[0].value}>
            <TabsList className="w-full">
              {methods.map((method) => (
                <TabsTrigger key={method.value} value={method.value}>
                  {method.label}
                </TabsTrigger>
              ))}
            </TabsList>
            {methods.map((method) => (
              <TabsContent key={method.value} value={method.value}>
                {method.content}
              </TabsContent>
            ))}
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
};
