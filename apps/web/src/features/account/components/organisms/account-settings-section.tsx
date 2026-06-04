import { Button } from "@sbox-analytics/ui/components/button";
import { Separator } from "@sbox-analytics/ui/components/separator";
import { Skeleton } from "@sbox-analytics/ui/components/skeleton";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { authClient } from "@/lib/auth-client";

import { ChangePasswordForm } from "../molecules/change-password-form";
import { ProfileForm } from "../molecules/profile-form";
import type { UserSession } from "../molecules/sessions-list";
import { SessionsList } from "../molecules/sessions-list";

const SESSIONS_QUERY_KEY = ["account-sessions"];

export const AccountSettingsSection = () => {
  const { data: session, isPending: isLoadingSession } =
    authClient.useSession();
  const queryClient = useQueryClient();

  const accountsQuery = useQuery({
    queryFn: async () => {
      const { data, error } = await authClient.listAccounts();
      if (error || !data) {
        throw new Error(error?.message ?? "Failed to load accounts");
      }
      return data;
    },
    queryKey: ["account-providers"],
  });

  const sessionsQuery = useQuery({
    queryFn: async () => {
      const { data, error } = await authClient.listSessions();
      if (error || !data) {
        throw new Error(error?.message ?? "Failed to load sessions");
      }
      return data as UserSession[];
    },
    queryKey: SESSIONS_QUERY_KEY,
  });

  const invalidateSessions = () =>
    queryClient.invalidateQueries({ queryKey: SESSIONS_QUERY_KEY });

  const revokeSession = useMutation({
    mutationFn: async (token: string) => {
      const { error } = await authClient.revokeSession({ token });
      if (error) {
        throw new Error(error.message ?? "Failed to revoke session");
      }
    },
    onError: (error) => toast.error(error.message),
    onSuccess: () => {
      toast.success("Session revoked");
      invalidateSessions();
    },
  });

  const revokeOtherSessions = useMutation({
    mutationFn: async () => {
      const { error } = await authClient.revokeOtherSessions();
      if (error) {
        throw new Error(error.message ?? "Failed to revoke sessions");
      }
    },
    onError: (error) => toast.error(error.message),
    onSuccess: () => {
      toast.success("Other sessions revoked");
      invalidateSessions();
    },
  });

  if (isLoadingSession || !session) {
    return (
      <div className="flex flex-col gap-8">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full max-w-lg" />
      </div>
    );
  }

  // Steam sign-ins have no credential account, so no password to change.
  const hasPassword = Boolean(
    accountsQuery.data?.some((account) => account.providerId === "credential")
  );

  const sessions = sessionsQuery.data ?? [];
  const otherSessionsCount = sessions.filter(
    (item) => item.token !== session.session.token
  ).length;

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <div>
          <h2 className="font-semibold text-lg">Profile</h2>
          <p className="text-muted-foreground text-sm">
            Your name and email as shown to your team.
          </p>
        </div>
        <ProfileForm user={session.user} />
      </section>

      {hasPassword && (
        <>
          <Separator />
          <section className="flex flex-col gap-4">
            <div>
              <h2 className="font-semibold text-lg">Password</h2>
              <p className="text-muted-foreground text-sm">
                Change the password you use to sign in.
              </p>
            </div>
            <ChangePasswordForm />
          </section>
        </>
      )}

      <Separator />

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold text-lg">Active sessions</h2>
            <p className="text-muted-foreground text-sm">
              Devices currently signed in to your account.
            </p>
          </div>
          {otherSessionsCount > 0 && (
            <Button
              disabled={revokeOtherSessions.isPending}
              onClick={() => revokeOtherSessions.mutate()}
              size="sm"
              variant="outline"
            >
              Sign out other sessions
            </Button>
          )}
        </div>
        {sessionsQuery.isLoading ? (
          <Skeleton className="h-24 w-full max-w-lg" />
        ) : (
          <SessionsList
            currentToken={session.session.token}
            onRevoke={(token) => revokeSession.mutate(token)}
            revokePending={revokeSession.isPending}
            sessions={sessions}
          />
        )}
      </section>
    </div>
  );
};
