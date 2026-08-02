import { useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useSession } from "@/lib/auth-client";
import { authRedirectPath } from "@/lib/auth-redirect";
import { usePostHog } from "@posthog/react";

interface AuthGuardProps {
  children: React.ReactNode;
  redirectToCurrent?: boolean;
}

function AuthGuard({ children, redirectToCurrent = false }: AuthGuardProps) {
  const { data: session, isPending } = useSession();
  const posthog = usePostHog();
  const location = useLocation();

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
    return (
      <Navigate
        to={authRedirectPath(location, redirectToCurrent)}
        replace
      />
    );
  }

  return <>{children}</>;
}

export default AuthGuard;
