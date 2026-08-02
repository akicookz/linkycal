import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Check,
  Copy,
  KeyRound,
  Loader,
  Plus,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ApiKey {
  id: string;
  prefix: string;
  label: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

interface CreatedKey {
  id: string;
  key: string;
  prefix: string;
  label: string | null;
}

interface RestApiKeysProps {
  projectId: string;
}

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const date = new Date(dateStr);
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function RestApiKeys({ projectId }: RestApiKeysProps) {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [createdKey, setCreatedKey] = useState<CreatedKey | null>(null);
  const [copied, setCopied] = useState(false);

  const apiKeysQuery = useQuery<ApiKey[]>({
    queryKey: ["api-keys", projectId],
    enabled: Boolean(projectId),
    queryFn: async function loadApiKeys() {
      const response = await fetch(`/api/projects/${projectId}/api-keys`);
      if (!response.ok) throw new Error("Failed to fetch API keys");
      const body = (await response.json()) as { apiKeys?: ApiKey[] };
      return body.apiKeys ?? [];
    },
  });

  const createMutation = useMutation({
    mutationFn: async function createApiKey(keyLabel: string) {
      const response = await fetch(`/api/projects/${projectId}/api-keys`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ label: keyLabel || undefined }),
      });
      if (!response.ok) throw new Error("Failed to create API key");
      return response.json() as Promise<{ apiKey: CreatedKey }>;
    },
    onSuccess: function showCreatedKey(data) {
      setCreatedKey(data.apiKey);
      setLabel("");
      void queryClient.invalidateQueries({
        queryKey: ["api-keys", projectId],
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async function deleteApiKey(id: string) {
      const response = await fetch(
        `/api/projects/${projectId}/api-keys/${id}`,
        { method: "DELETE" },
      );
      if (!response.ok) throw new Error("Failed to delete API key");
    },
    onSuccess: function refreshApiKeys() {
      setDeleteId(null);
      void queryClient.invalidateQueries({
        queryKey: ["api-keys", projectId],
      });
    },
  });

  function closeCreateDialog(): void {
    setCreateOpen(false);
    setCreatedKey(null);
    setLabel("");
    setCopied(false);
  }

  async function copyCreatedKey(): Promise<void> {
    if (!createdKey) return;
    await navigator.clipboard?.writeText(createdKey.key);
    setCopied(true);
  }

  const apiKeys = apiKeysQuery.data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>REST API keys</CardTitle>
        <CardDescription>
          These keys authenticate server-side REST API requests. MCP
          connections use OAuth.
        </CardDescription>
        <CardAction>
          <Dialog
            open={createOpen}
            onOpenChange={function setCreateDialogOpen(open) {
              if (open) setCreateOpen(true);
              else closeCreateDialog();
            }}
          >
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus aria-hidden="true" />
                Create API key
              </Button>
            </DialogTrigger>
            <DialogContent>
              {!createdKey ? (
                <>
                  <DialogHeader>
                    <DialogTitle>Create API key</DialogTitle>
                    <DialogDescription>
                      Generate a server-side key for REST API access to this
                      project.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-2 py-2">
                    <Label htmlFor="key-label">Label (optional)</Label>
                    <Input
                      id="key-label"
                      placeholder="Integration key"
                      value={label}
                      onChange={function updateLabel(event) {
                        setLabel(event.target.value);
                      }}
                    />
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={closeCreateDialog}>
                      Cancel
                    </Button>
                    <Button
                      disabled={createMutation.isPending}
                      onClick={function createKey() {
                        createMutation.mutate(label);
                      }}
                    >
                      {createMutation.isPending ? (
                        <Loader className="animate-spin" aria-hidden="true" />
                      ) : (
                        <Plus aria-hidden="true" />
                      )}
                      {createMutation.isPending ? "Creating..." : "Create key"}
                    </Button>
                  </DialogFooter>
                </>
              ) : (
                <>
                  <DialogHeader>
                    <DialogTitle>API key created</DialogTitle>
                    <DialogDescription>
                      Copy this key now. It cannot be retrieved after you close
                      this dialog.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-2">
                    <div className="flex items-start gap-2 rounded-[16px] bg-amber-50 p-3 text-amber-800">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                      <p className="text-sm">
                        Store this key in a server-side secret manager.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label>Your API key</Label>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <code className="min-w-0 flex-1 break-all rounded-[12px] bg-muted px-3 py-2.5 font-mono text-sm">
                          {createdKey.key}
                        </code>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={copyCreatedKey}
                        >
                          {copied ? (
                            <Check className="text-emerald-600" aria-hidden="true" />
                          ) : (
                            <Copy aria-hidden="true" />
                          )}
                          {copied ? "Copied" : "Copy"}
                        </Button>
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button onClick={closeCreateDialog}>
                      <Check aria-hidden="true" />
                      Done
                    </Button>
                  </DialogFooter>
                </>
              )}
            </DialogContent>
          </Dialog>
        </CardAction>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="rounded-[16px] bg-muted/50 p-4">
          <p className="text-xs font-medium text-muted-foreground">
            Example REST request
          </p>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all font-mono text-xs leading-6 text-foreground">
            {`curl -H "Authorization: Bearer YOUR_API_KEY" \\\n+  ${window.location.origin}/api/projects/${projectId}/contacts`}
          </pre>
        </div>

        {apiKeysQuery.isPending ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader className="size-4 animate-spin" aria-hidden="true" />
            Loading API keys...
          </div>
        ) : apiKeys.length === 0 ? (
          <div className="rounded-[16px] bg-muted/50 px-5 py-8 text-center">
            <KeyRound className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-foreground">
              No API keys yet
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Create a key for a trusted server-side integration.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {apiKeys.map(function apiKeyRow(apiKey) {
              return (
                <div
                  key={apiKey.id}
                  className="flex flex-col gap-3 rounded-[16px] bg-muted/50 px-4 py-3 sm:flex-row sm:items-center"
                >
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <KeyRound className="size-4 text-primary" aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {apiKey.label || "Untitled"}
                      <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">
                        {apiKey.prefix}...
                      </span>
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {formatRelativeTime(apiKey.lastUsedAt)} · Created{" "}
                      {formatDate(apiKey.createdAt)}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={function openDeleteDialog() {
                      setDeleteId(apiKey.id);
                    }}
                  >
                    <Trash2 aria-hidden="true" />
                    Delete
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <Dialog
        open={Boolean(deleteId)}
        onOpenChange={function setDeleteDialogOpen(open) {
          if (!open && !deleteMutation.isPending) setDeleteId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete API key</DialogTitle>
            <DialogDescription>
              Applications using this key will lose REST API access
              immediately. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={function cancelDelete() {
              setDeleteId(null);
            }}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={function deleteKey() {
                if (deleteId) deleteMutation.mutate(deleteId);
              }}
            >
              {deleteMutation.isPending ? (
                <Loader className="animate-spin" aria-hidden="true" />
              ) : (
                <Trash2 aria-hidden="true" />
              )}
              {deleteMutation.isPending ? "Deleting..." : "Delete key"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
