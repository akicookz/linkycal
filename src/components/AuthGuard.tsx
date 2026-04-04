import { useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useSession } from "@/lib/auth-client";
import { usePostHog } from "@posthog/react";

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { data: session, isPending } = useSession();
  const posthog = usePostHog();

  useEffect(() => {
    if (session?.user) {
      posthog?.identify(session.user.id, {
        email: session.user.email,
        name: session.user.name,
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id]);

  if (isPending) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/?show_auth=true" replace />;
  }

  return <>{children}</>;
}

export default AuthGuard;
