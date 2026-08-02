import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Eye, Loader, Pencil, RefreshCw, ShieldCheck } from "lucide-react";
import { useLocation } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/Logo";
import { McpClientIcon } from "@/components/mcp/McpClientIcon";

type McpOAuthScope = "read" | "write" | "offline_access";

interface McpAuthorizationContext {
  clientName: string;
  scopes: McpOAuthScope[];
  projects: Array<{ id: string; name: string }>;
}

type AuthorizationDecision =
  | { decision: "approve"; projectId: string }
  | { decision: "deny" };

interface OAuthAuthorizeProps {
  onRedirect?: (url: string) => void;
}

function followOAuthRedirect(url: string): void {
  window.location.assign(url);
}

async function readSafeJson(response: Response): Promise<Record<string, unknown>> {
  return response.json().catch(function invalidJson() {
    return {};
  }) as Promise<Record<string, unknown>>;
}

function PermissionRow({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Eye;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-[16px] bg-muted/50 px-4 py-3">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-[11px] bg-background text-primary shadow-sm">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
          {description}
        </p>
      </div>
    </div>
  );
}

export default function OAuthAuthorize({
  onRedirect = followOAuthRedirect,
}: OAuthAuthorizeProps) {
  const location = useLocation();
  const endpoint = `/api/oauth/mcp/authorization${location.search}`;
  const [projectId, setProjectId] = useState("");
  const [pendingDecision, setPendingDecision] =
    useState<AuthorizationDecision | null>(null);

  const authorizationQuery = useQuery<McpAuthorizationContext>({
    queryKey: ["mcp-oauth-authorization", location.search],
    queryFn: async function loadAuthorization() {
      const response = await fetch(endpoint);
      const body = await readSafeJson(response);
      if (!response.ok || !body.authorization) {
        throw new Error("Invalid OAuth authorization request");
      }
      return body.authorization as McpAuthorizationContext;
    },
  });

  useEffect(
    function selectFirstEligibleProject() {
      const firstProjectId = authorizationQuery.data?.projects[0]?.id;
      if (!projectId && firstProjectId) setProjectId(firstProjectId);
    },
    [authorizationQuery.data?.projects, projectId],
  );

  const decisionMutation = useMutation({
    mutationFn: async function submitDecision(decision: AuthorizationDecision) {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(decision),
      });
      const body = await readSafeJson(response);
      if (!response.ok || typeof body.redirectTo !== "string") {
        throw new Error("Authorization could not be completed");
      }
      return body.redirectTo;
    },
    onSuccess: function redirectToClient(redirectTo) {
      onRedirect(redirectTo);
    },
  });

  function submitDecision(decision: AuthorizationDecision): void {
    setPendingDecision(decision);
    decisionMutation.mutate(decision);
  }

  const authorization = authorizationQuery.data;
  const isAllowing =
    decisionMutation.isPending && pendingDecision?.decision === "approve";
  const isDenying =
    decisionMutation.isPending && pendingDecision?.decision === "deny";

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#F8FAF8] px-4 py-20">
      <div
        className="pointer-events-none absolute inset-0 opacity-55 [background-image:radial-gradient(#1B43321a_1px,transparent_1px)] [background-size:18px_18px]"
        aria-hidden="true"
      />
      <div className="absolute left-6 top-6 sm:left-8 sm:top-8">
        <Logo size="sm" />
      </div>

      <Card className="relative w-full max-w-[520px] rounded-[20px] border-border/70 bg-background shadow-[0_24px_70px_rgba(14,26,20,0.12)]">
        <CardContent className="space-y-6 p-6 sm:p-8">
          {authorizationQuery.isPending ? (
            <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader className="size-4 animate-spin" aria-hidden="true" />
              Loading authorization request...
            </div>
          ) : authorizationQuery.isError || !authorization ? (
            <div className="space-y-3 py-8 text-center">
              <div className="mx-auto flex size-12 items-center justify-center rounded-[16px] bg-destructive/10 text-destructive">
                <ShieldCheck className="size-5" aria-hidden="true" />
              </div>
              <h1 className="text-xl font-semibold text-foreground">
                This authorization request is invalid or expired.
              </h1>
              <p className="text-sm leading-6 text-muted-foreground">
                Return to your MCP client and start the connection again.
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-4">
                <McpClientIcon clientName={authorization.clientName} />
                <div className="min-w-0">
                  <p className="text-sm text-muted-foreground">
                    Connect to LinkyCal
                  </p>
                  <h1 className="truncate text-xl font-semibold text-foreground">
                    {authorization.clientName}
                  </h1>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="mcp-project">LinkyCal project</Label>
                <select
                  id="mcp-project"
                  value={projectId}
                  onChange={function selectProject(event) {
                    setProjectId(event.target.value);
                  }}
                  disabled={authorization.projects.length === 0}
                  className="h-11 w-full rounded-[12px] bg-muted/50 px-3 text-sm text-foreground outline-none ring-ring transition-shadow focus:ring-2 disabled:opacity-60"
                >
                  {authorization.projects.length === 0 ? (
                    <option value="">No eligible projects</option>
                  ) : null}
                  {authorization.projects.map(function project(project) {
                    return (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    );
                  })}
                </select>
                {authorization.projects.length === 0 ? (
                  <p className="text-xs leading-5 text-destructive">
                    You need administrator access to a LinkyCal project.
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">
                  Requested access
                </p>
                {authorization.scopes.includes("read") ? (
                  <PermissionRow
                    icon={Eye}
                    title="Read your LinkyCal data"
                    description="View bookings, availability, contacts, forms, workflows, and analytics in the selected project."
                  />
                ) : null}
                {authorization.scopes.includes("write") ? (
                  <PermissionRow
                    icon={Pencil}
                    title="Create and update LinkyCal data"
                    description="Create or change records only inside the selected project."
                  />
                ) : null}
                {authorization.scopes.includes("offline_access") ? (
                  <PermissionRow
                    icon={RefreshCw}
                    title="Stay connected"
                    description="Refresh access without asking you to sign in every hour."
                  />
                ) : null}
              </div>

              {decisionMutation.isError ? (
                <p role="alert" className="text-sm text-destructive">
                  We couldn't complete this authorization. Return to your MCP
                  client and try again.
                </p>
              ) : null}

              <div className="flex items-center justify-end gap-2 pt-1">
                <Button
                  type="button"
                  variant="ghost"
                  disabled={decisionMutation.isPending}
                  onClick={function denyAccess() {
                    submitDecision({ decision: "deny" });
                  }}
                >
                  {isDenying ? "Cancelling..." : "Cancel"}
                </Button>
                <Button
                  type="button"
                  disabled={!projectId || decisionMutation.isPending}
                  onClick={function allowAccess() {
                    submitDecision({ decision: "approve", projectId });
                  }}
                >
                  {isAllowing ? (
                    <Loader className="animate-spin" aria-hidden="true" />
                  ) : (
                    <ShieldCheck aria-hidden="true" />
                  )}
                  {isAllowing ? "Allowing..." : "Allow access"}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
