import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowRight, Loader, LogIn, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Logo } from "@/components/Logo";
import { useSession } from "@/lib/auth-client";

interface InviteData {
  id: string;
  email: string;
  teamRole: string;
  projectRole: string | null;
  team: { id: string; name: string };
  project: { id: string; name: string } | null;
}

export default function Invite() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { data: session, isPending: sessionPending } = useSession();

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
      navigate(body.projectId ? `/app/projects/${body.projectId}` : "/app");
    },
  });

  const invite = data?.invite;
  const signedInEmail = session?.user?.email?.toLowerCase();
  const inviteEmail = invite?.email.toLowerCase();
  const emailMismatch = !!signedInEmail && !!inviteEmail && signedInEmail !== inviteEmail;

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
                <Link to="/?show_auth=true">
                  <LogIn className="h-4 w-4" />
                  Sign in to accept
                </Link>
              </Button>
            ) : emailMismatch ? (
              <p className="text-sm text-destructive">
                This invite is for {invite.email}. Sign in with that email to accept it.
              </p>
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
