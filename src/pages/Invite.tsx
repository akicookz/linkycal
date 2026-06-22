import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowRight, Loader, LogIn, LogOut, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Logo } from "@/components/Logo";
import { signOut, useSession } from "@/lib/auth-client";

interface InviteData {
  id: string;
  teamRole: string;
  projectRole: string | null;
  team: { id: string; name: string };
  project: { id: string; name: string } | null;
  emailMatchesSignedInUser: boolean | null;
}

export default function Invite() {
  const { token } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: session, isPending: sessionPending } = useSession();
  const invitePath = token ? `/invite/${token}?accept=true` : "/app";
  const signInPath = `/?show_auth=true&redirect=${encodeURIComponent(invitePath)}`;

  const { data, isLoading, isError } = useQuery<{ invite: InviteData }>({
    queryKey: ["invite", token],
    queryFn: async () => {
      const res = await fetch(`/api/invites/${token}`);
      if (!res.ok) throw new Error("Invite not found");
      return res.json();
    },
    enabled: !!token,
  });

  const acceptMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/invites/${token}/accept`, {
        method: "POST",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Failed to accept invite");
      return body as { projectId?: string | null };
    },
    onSuccess: (body) => {
      queryClient.removeQueries({ queryKey: ["projects"] });
      navigate(body.projectId ? `/app/projects/${body.projectId}` : "/app");
    },
  });

  const signOutMutation = useMutation({
    mutationFn: async () => {
      await signOut();
    },
    onSuccess: () => {
      navigate(signInPath);
    },
  });

  const invite = data?.invite;
  const emailMismatch = invite?.emailMatchesSignedInUser === false;
  const autoAccept = searchParams.get("accept") === "true";

  useEffect(() => {
    if (
      !autoAccept ||
      sessionPending ||
      !session ||
      !invite ||
      invite.emailMatchesSignedInUser !== true ||
      acceptMutation.isPending ||
      acceptMutation.isSuccess
    ) {
      return;
    }

    acceptMutation.mutate();
  }, [
    acceptMutation,
    autoAccept,
    invite,
    session,
    sessionPending,
  ]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex justify-center">
          <Link to="/">
            <Logo size="md" />
          </Link>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Team invite</CardTitle>
            <CardDescription>
              {isLoading
                ? "Loading your invitation."
                : isError || !invite
                  ? "This invite is invalid or expired."
                  : `You've been invited to join ${invite.team.name}.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading || sessionPending ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader className="h-4 w-4 animate-spin" />
                Loading
              </div>
            ) : isError || !invite ? (
              <Button asChild>
                <Link to="/">
                  <ArrowRight className="h-4 w-4" />
                  Go home
                </Link>
              </Button>
            ) : !session ? (
              <Button asChild>
                <Link to={signInPath}>
                  <LogIn className="h-4 w-4" />
                  Sign in to accept
                </Link>
              </Button>
            ) : emailMismatch ? (
              <div className="space-y-3">
                <p className="text-sm text-destructive">
                  You are signed in with a different account. Switch accounts to accept this invite.
                </p>
                <Button
                  variant="outline"
                  onClick={() => signOutMutation.mutate()}
                  disabled={signOutMutation.isPending}
                >
                  {signOutMutation.isPending ? (
                    <Loader className="h-4 w-4 animate-spin" />
                  ) : (
                    <LogOut className="h-4 w-4" />
                  )}
                  Switch account
                </Button>
              </div>
            ) : (
              <>
                {invite.project && (
                  <p className="text-sm text-muted-foreground">
                    Project access: {invite.project.name}
                  </p>
                )}
                {acceptMutation.isError && (
                  <p className="text-sm text-destructive">
                    {(acceptMutation.error as Error).message}
                  </p>
                )}
                <Button
                  onClick={() => acceptMutation.mutate()}
                  disabled={acceptMutation.isPending}
                >
                  {acceptMutation.isPending ? (
                    <Loader className="h-4 w-4 animate-spin" />
                  ) : (
                    <UserPlus className="h-4 w-4" />
                  )}
                  Accept invite
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
