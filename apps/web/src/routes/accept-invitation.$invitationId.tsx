import { Button } from "@sbox-analytics/ui/components/button";
import {
  createFileRoute,
  redirect,
  useNavigate,
  useParams,
} from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import Loader from "@/components/loader";
import { authClient } from "@/lib/auth-client";

const AcceptInvitationPage = () => {
  const { invitationId } = useParams({
    from: "/accept-invitation/$invitationId",
  });
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) {
      return;
    }
    started.current = true;

    const accept = async () => {
      const { data, error: acceptError } =
        await authClient.organization.acceptInvitation({ invitationId });
      if (acceptError || !data) {
        setError(
          acceptError?.message ?? "This invitation is invalid or has expired."
        );
        return;
      }
      await authClient.organization.setActive({
        organizationId: data.invitation.organizationId,
      });
      toast.success("Invitation accepted");
      navigate({ to: "/dashboard" });
    };

    accept();
  }, [invitationId, navigate]);

  if (error) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-4 bg-background p-6">
        <h1 className="font-semibold text-xl">Invitation not accepted</h1>
        <p className="text-muted-foreground text-sm">{error}</p>
        <Button onClick={() => navigate({ to: "/dashboard" })}>
          Go to dashboard
        </Button>
      </div>
    );
  }

  return <Loader />;
};

export const Route = createFileRoute("/accept-invitation/$invitationId")({
  beforeLoad: async ({ params }) => {
    const session = await authClient.getSession();
    if (!session.data) {
      redirect({
        search: { redirect: `/accept-invitation/${params.invitationId}` },
        throw: true,
        to: "/login",
      });
    }
  },
  component: AcceptInvitationPage,
});
