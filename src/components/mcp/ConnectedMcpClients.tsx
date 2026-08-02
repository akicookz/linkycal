import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader, PlugZap, Unplug } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { McpClientIcon } from "@/components/mcp/McpClientIcon";

interface McpConnection {
  id: string;
  clientName: string;
  scopes: Array<"read" | "write" | "offline_access">;
  createdAt: string;
  authorizedBy: {
    name: string;
    email: string;
  };
}

interface ConnectedMcpClientsProps {
  projectId: string;
}

function formatConnectedDate(value: string): string {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

async function responseError(
  response: Response,
  fallback: string,
): Promise<Error> {
  const body = (await response.json().catch(function invalidJson() {
    return {};
  })) as { error?: unknown };
  return new Error(typeof body.error === "string" ? body.error : fallback);
}

export function ConnectedMcpClients({
  projectId,
}: ConnectedMcpClientsProps) {
  const queryClient = useQueryClient();
  const [revokeConnection, setRevokeConnection] =
    useState<McpConnection | null>(null);

  const connectionsQuery = useQuery<McpConnection[]>({
    queryKey: ["mcp-connections", projectId],
    enabled: Boolean(projectId),
    queryFn: async function loadConnections() {
      const response = await fetch(
        `/api/projects/${projectId}/mcp-connections`,
      );
      if (!response.ok) {
        throw await responseError(response, "Failed to fetch MCP connections");
      }
      const body = (await response.json()) as { connections?: McpConnection[] };
      return body.connections ?? [];
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async function revoke(connectionId: string) {
      const response = await fetch(
        `/api/projects/${projectId}/mcp-connections/${connectionId}`,
        { method: "DELETE" },
      );
      if (!response.ok) {
        throw await responseError(response, "Failed to revoke MCP connection");
      }
    },
    onSuccess: async function refreshConnections() {
      setRevokeConnection(null);
      await queryClient.invalidateQueries({
        queryKey: ["mcp-connections", projectId],
      });
    },
  });

  const connections = connectionsQuery.data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connected MCP clients</CardTitle>
        <CardDescription>
          OAuth clients with access to this project. Revoking a client stops
          both current access and future token refreshes.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {connectionsQuery.isPending ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader className="size-4 animate-spin" aria-hidden="true" />
            Loading connected clients...
          </div>
        ) : connectionsQuery.isError ? (
          <p role="alert" className="rounded-[16px] bg-destructive/10 p-4 text-sm text-destructive">
            {connectionsQuery.error.message}
          </p>
        ) : connections.length === 0 ? (
          <div className="rounded-[16px] bg-muted/50 px-5 py-8 text-center">
            <PlugZap className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-foreground">
              No MCP clients connected
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Use the setup instructions below to connect your first client.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {connections.map(function connectionRow(connection) {
              return (
                <div
                  key={connection.id}
                  className="flex flex-col gap-4 rounded-[16px] bg-muted/50 px-4 py-3 sm:flex-row sm:items-center"
                >
                  <McpClientIcon clientName={connection.clientName} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {connection.clientName}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      <span>{connection.scopes.join(", ")}</span>
                      <span>
                        {" "}· Connected {formatConnectedDate(connection.createdAt)}
                      </span>
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      Authorized by {connection.authorizedBy.name} ·{" "}
                      {connection.authorizedBy.email}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={function openRevokeDialog() {
                      revokeMutation.reset();
                      setRevokeConnection(connection);
                    }}
                  >
                    <Unplug aria-hidden="true" />
                    Revoke
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <Dialog
        open={Boolean(revokeConnection)}
        onOpenChange={function setDialogOpen(open) {
          if (!open && !revokeMutation.isPending) setRevokeConnection(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke MCP connection</DialogTitle>
            <DialogDescription>
              {revokeConnection?.clientName} will immediately lose access to
              this project, and its refresh token will stop working.
            </DialogDescription>
          </DialogHeader>
          {revokeMutation.isError ? (
            <p role="alert" className="rounded-[16px] bg-destructive/10 p-3 text-sm text-destructive">
              {revokeMutation.error.message}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={revokeMutation.isPending}
              onClick={function cancelRevoke() {
                setRevokeConnection(null);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={revokeMutation.isPending}
              onClick={function confirmRevoke() {
                if (revokeConnection) {
                  revokeMutation.mutate(revokeConnection.id);
                }
              }}
            >
              {revokeMutation.isPending ? (
                <Loader className="animate-spin" aria-hidden="true" />
              ) : (
                <Unplug aria-hidden="true" />
              )}
              {revokeMutation.isPending ? "Revoking..." : "Revoke access"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
