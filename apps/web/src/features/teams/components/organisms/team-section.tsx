import { Button } from "@sbox-analytics/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@sbox-analytics/ui/components/empty";
import { Skeleton } from "@sbox-analytics/ui/components/skeleton";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { authClient } from "@/lib/auth-client";
import { orpc } from "@/utils/orpc";

import type { InvitableRole } from "../atoms/role-select";
import type { CreateUserInput } from "../molecules/invite-member-dialog";
import { InviteMemberDialog } from "../molecules/invite-member-dialog";
import type { PendingInvitation } from "../molecules/pending-invitations-table";
import { PendingInvitationsTable } from "../molecules/pending-invitations-table";
import type { TeamMember } from "../molecules/team-members-table";
import { TeamMembersTable } from "../molecules/team-members-table";

const MANAGER_ROLES = new Set(["owner", "admin"]);

const teamQueryKey = (organizationId: string) => ["team", organizationId];

const useTeamMutations = (
  organizationId: string | undefined,
  handlers: { closeInvite: () => void; setLink: (url: string) => void }
) => {
  const queryClient = useQueryClient();

  const invalidateTeam = () => {
    if (organizationId) {
      queryClient.invalidateQueries({ queryKey: teamQueryKey(organizationId) });
    }
  };

  const inviteEmail = useMutation({
    mutationFn: async (input: { email: string; role: InvitableRole }) => {
      const { error } = await authClient.organization.inviteMember({
        email: input.email,
        organizationId,
        role: input.role,
      });
      if (error) {
        throw new Error(error.message ?? "Failed to send invitation");
      }
    },
    onError: (error) => toast.error(error.message),
    onSuccess: () => {
      toast.success("Invitation sent");
      handlers.closeInvite();
      invalidateTeam();
    },
  });

  const removeMember = useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await authClient.organization.removeMember({
        memberIdOrEmail: memberId,
        organizationId,
      });
      if (error) {
        throw new Error(error.message ?? "Failed to remove member");
      }
    },
    onError: (error) => toast.error(error.message),
    onSuccess: () => {
      toast.success("Member removed");
      invalidateTeam();
    },
  });

  const cancelInvitation = useMutation({
    mutationFn: async (invitationId: string) => {
      const { error } = await authClient.organization.cancelInvitation({
        invitationId,
      });
      if (error) {
        throw new Error(error.message ?? "Failed to cancel invitation");
      }
    },
    onError: (error) => toast.error(error.message),
    onSuccess: () => {
      toast.success("Invitation cancelled");
      invalidateTeam();
    },
  });

  const createLink = useMutation({
    ...orpc.teams.createInviteLink.mutationOptions(),
    onError: () => toast.error("Failed to create invite link"),
    onSuccess: (data) => handlers.setLink(data.url),
  });

  const createUser = useMutation({
    ...orpc.teams.createMember.mutationOptions(),
    onError: (error) => toast.error(error.message),
    onSuccess: () => {
      toast.success("Account created and added to the team");
      handlers.closeInvite();
      invalidateTeam();
    },
  });

  return {
    cancelInvitation,
    createLink,
    createUser,
    inviteEmail,
    removeMember,
  };
};

const PendingInvitationsSection = ({
  cancelPending,
  invitations,
  onCancel,
  visible,
}: {
  visible: boolean;
  invitations: PendingInvitation[];
  onCancel: (invitationId: string) => void;
  cancelPending: boolean;
}) => {
  if (!visible || invitations.length === 0) {
    return null;
  }
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="font-semibold text-lg">
          Pending invitations ({invitations.length})
        </h2>
        <p className="text-muted-foreground text-sm">
          Invitations that haven't been accepted yet.
        </p>
      </div>
      <PendingInvitationsTable
        cancelPending={cancelPending}
        invitations={invitations}
        onCancel={onCancel}
      />
    </section>
  );
};

export const TeamSection = () => {
  const { data: session } = authClient.useSession();
  const { data: activeOrg } = authClient.useActiveOrganization();
  const organizationId = activeOrg?.id;

  const [inviteOpen, setInviteOpen] = useState(false);
  const [createdLink, setCreatedLink] = useState<string | null>(null);

  const capabilitiesQuery = useQuery(orpc.teams.capabilities.queryOptions());

  const teamQuery = useQuery({
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const { data, error } = await authClient.organization.getFullOrganization(
        { query: { organizationId } }
      );
      if (error || !data) {
        throw new Error(error?.message ?? "Failed to load team");
      }
      return data;
    },
    queryKey: teamQueryKey(organizationId ?? ""),
  });

  const mutations = useTeamMutations(organizationId, {
    closeInvite: () => setInviteOpen(false),
    setLink: setCreatedLink,
  });

  const members = (teamQuery.data?.members ?? []) as TeamMember[];
  const pendingInvitations = (teamQuery.data?.invitations ?? []).filter(
    (invitation) => invitation.status === "pending"
  ) as PendingInvitation[];

  const currentRole = members.find(
    (member) => member.userId === session?.user.id
  )?.role;
  const canManage = Boolean(currentRole && MANAGER_ROLES.has(currentRole));

  const handleInviteOpenChange = (open: boolean) => {
    if (!open) {
      setCreatedLink(null);
    }
    setInviteOpen(open);
  };

  if (!organizationId || teamQuery.isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (teamQuery.isError) {
    return (
      <p className="py-6 text-center text-destructive text-sm">
        Failed to load team members.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-lg">
              Members ({members.length})
            </h2>
            <p className="text-muted-foreground text-sm">
              Everyone with access to {activeOrg?.name}.
            </p>
          </div>
          {canManage ? (
            <Button onClick={() => setInviteOpen(true)} size="sm">
              Invite member
            </Button>
          ) : null}
        </div>

        {members.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Users />
              </EmptyMedia>
              <EmptyTitle>No members</EmptyTitle>
              <EmptyDescription>
                Invite teammates to collaborate on your analytics.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <TeamMembersTable
            canManage={canManage}
            currentUserId={session?.user.id ?? ""}
            members={members}
            onRemove={(memberId) => mutations.removeMember.mutate(memberId)}
            removePending={mutations.removeMember.isPending}
          />
        )}
      </section>

      <PendingInvitationsSection
        cancelPending={mutations.cancelInvitation.isPending}
        invitations={pendingInvitations}
        onCancel={(invitationId) =>
          mutations.cancelInvitation.mutate(invitationId)
        }
        visible={canManage}
      />

      <InviteMemberDialog
        createdLink={createdLink}
        createLinkPending={mutations.createLink.isPending}
        createUserPending={mutations.createUser.isPending}
        emailInvitesAvailable={capabilitiesQuery.data?.emailInvites ?? false}
        inviteEmailPending={mutations.inviteEmail.isPending}
        onCreateLink={(role) => {
          if (organizationId) {
            mutations.createLink.mutate({ organizationId, role });
          }
        }}
        onCreateUser={(input: CreateUserInput) => {
          if (organizationId) {
            mutations.createUser.mutate({ ...input, organizationId });
          }
        }}
        onInviteEmail={(email, role) =>
          mutations.inviteEmail.mutate({ email, role })
        }
        onOpenChange={handleInviteOpenChange}
        open={inviteOpen}
      />
    </div>
  );
};
