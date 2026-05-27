import { createFileRoute } from "@tanstack/react-router";

import Loader from "@/components/loader";
import { LoginForm } from "@/features/auth/components/molecules/login-form";
import { authClient } from "@/lib/auth-client";

const RouteComponent = () => {
  const { isPending } = authClient.useSession();

  if (isPending) {
    return <Loader />;
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-background p-6 md:p-10">
      <div className="w-full max-w-sm">
        <LoginForm />
      </div>
    </div>
  );
};

export const Route = createFileRoute("/login")({
  component: RouteComponent,
});
