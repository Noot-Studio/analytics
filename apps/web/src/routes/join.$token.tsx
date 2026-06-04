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
import { client } from "@/utils/orpc";

const JoinPage = () => {
  const { token } = useParams({ from: "/join/$token" });
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) {
      return;
    }
    started.current = true;

    const join = async () => {
      try {
        const result = await client.teams.joinViaLink({ token });
        await authClient.organization.setActive({
          organizationId: result.organizationId,
        });
        toast.success(
          result.alreadyMember
            ? `You're already a member of ${result.organizationName}`
            : `Welcome to ${result.organizationName}`
        );
        navigate({ to: "/dashboard" });
      } catch (joinError) {
        setError(
          joinError instanceof Error
            ? joinError.message
            : "This invitation link is invalid or has expired."
        );
      }
    };

    join();
  }, [token, navigate]);

  if (error) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-4 bg-background p-6">
        <h1 className="font-semibold text-xl">Couldn't join organization</h1>
        <p className="text-muted-foreground text-sm">{error}</p>
        <Button onClick={() => navigate({ to: "/dashboard" })}>
          Go to dashboard
        </Button>
      </div>
    );
  }

  return <Loader />;
};

export const Route = createFileRoute("/join/$token")({
  beforeLoad: async ({ params }) => {
    const session = await authClient.getSession();
    if (!session.data) {
      redirect({
        search: { redirect: `/join/${params.token}` },
        throw: true,
        to: "/login",
      });
    }
  },
  component: JoinPage,
});
