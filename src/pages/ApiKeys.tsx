import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, KeyRound, Copy, Check, Trash2, AlertTriangle } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
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

// ─── Component ────────────────────────────────────────────────────────────────

export default function ApiKeys() {
  const { projectId } = useParams<{ projectId: string }>();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [createdKey, setCreatedKey] = useState<CreatedKey | null>(null);
  const [copied, setCopied] = useState(false);

  // ─── Queries ────────────────────────────────────────────────────────────

  const { data: apiKeys = [], isLoading } = useQuery<ApiKey[]>({
    queryKey: ["api-keys", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/api-keys`);
      if (!res.ok) throw new Error("Failed to fetch API keys");
      const data = await res.json();
      return data.apiKeys ?? [];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (keyLabel: string) => {
      const res = await fetch(`/api/projects/${projectId}/api-keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: keyLabel || undefined }),
      });
      if (!res.ok) throw new Error("Failed to create API key");
      return res.json() as Promise<{ apiKey: CreatedKey }>;
    },
    onSuccess: (data) => {
      setCreatedKey(data.apiKey);
      setLabel("");
      queryClient.invalidateQueries({ queryKey: ["api-keys", projectId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/projects/${projectId}/api-keys/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete API key");
    },
    onSuccess: () => {
      setDeleteId(null);
      queryClient.invalidateQueries({ queryKey: ["api-keys", projectId] });
    },
  });

  // ─── Handlers ───────────────────────────────────────────────────────────

  function handleCreate() {
    createMutation.mutate(label);
  }

  function handleCopy() {
    if (createdKey) {
      navigator.clipboard.writeText(createdKey.key);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  function handleCloseCreate() {
    setCreateOpen(false);
    setCreatedKey(null);
    setLabel("");
    setCopied(false);
  }

  // apiKeys is directly available from the query above

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div>
      <PageHeader title="API Keys" description="Manage API keys for programmatic access">
        <Dialog open={createOpen} onOpenChange={(open) => {
          if (!open) handleCloseCreate();
          else setCreateOpen(true);
        }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-1.5" />
              Create API Key
            </Button>
          </DialogTrigger>
          <DialogContent>
            {!createdKey ? (
              <>
                <DialogHeader>
                  <DialogTitle>Create API Key</DialogTitle>
                  <DialogDescription>
                    Generate a new API key for programmatic access to your project.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-2">
                    <Label htmlFor="key-label">Label (optional)</Label>
                    <Input
                      id="key-label"
                      placeholder="e.g. Production, Staging, CI/CD"
                      value={label}
                      onChange={(e) => setLabel(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={handleCloseCreate}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleCreate}
                    disabled={createMutation.isPending}
                  >
                    {createMutation.isPending ? "Creating..." : "Create Key"}
                  </Button>
                </DialogFooter>
              </>
            ) : (
              <>
                <DialogHeader>
                  <DialogTitle>API Key Created</DialogTitle>
                  <DialogDescription>
                    Copy your API key now. This key will only be shown once and cannot be retrieved later.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="rounded-[16px] bg-amber-50 border border-amber-200 p-3 flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                    <p className="text-sm text-amber-800">
                      Make sure to copy your API key now. You won't be able to see it again.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Your API Key</Label>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 rounded-[12px] bg-muted px-3 py-2.5 text-sm font-mono break-all select-all">
                        {createdKey.key}
                      </code>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={handleCopy}
                        className="shrink-0"
                      >
                        {copied ? (
                          <Check className="h-4 w-4 text-emerald-600" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={handleCloseCreate}>Done</Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>
      </PageHeader>

      {/* Info section */}
      <div className="rounded-[20px] border bg-muted/30 p-5 mb-6">
        <h3 className="text-sm font-semibold text-foreground mb-2">Using API Keys</h3>
        <p className="text-sm text-muted-foreground mb-3">
          Include your API key in the <code className="rounded-[8px] bg-muted px-1.5 py-0.5 text-xs font-mono">Authorization</code> header of your requests.
        </p>
        <div className="rounded-[16px] bg-background border p-4 font-mono text-xs leading-relaxed overflow-x-auto">
          <span className="text-muted-foreground">curl</span>{" "}
          <span className="text-emerald-700">-H</span>{" "}
          <span className="text-blue-700">"Authorization: Bearer YOUR_API_KEY"</span>{" "}
          <span className="text-muted-foreground">\</span>
          <br />
          {"  "}
          <span className="text-foreground">https://linkycal.com/api/v1/availability/your-project?date=2025-01-15&timezone=UTC&eventTypeSlug=consultation</span>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-[20px] border">
        <div className="px-6 py-4 border-b">
          <div className="grid grid-cols-5 text-sm font-medium text-muted-foreground">
            <span>Label</span>
            <span>Key</span>
            <span>Last Used</span>
            <span>Created</span>
            <span className="text-right">Actions</span>
          </div>
        </div>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            <p className="text-sm text-muted-foreground mt-4">Loading API keys...</p>
          </div>
        ) : apiKeys.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <KeyRound className="h-10 w-10 text-muted-foreground mb-4" />
            <p className="text-sm font-medium text-foreground mb-1">No API keys yet</p>
            <p className="text-sm text-muted-foreground">
              Create an API key to access LinkyCal programmatically.
            </p>
          </div>
        ) : (
          <div className="divide-y">
            {apiKeys.map((apiKey) => (
              <div
                key={apiKey.id}
                className="grid grid-cols-5 items-center px-6 py-4 text-sm"
              >
                <span className="font-medium text-foreground">
                  {apiKey.label || "Untitled"}
                </span>
                <span className="font-mono text-muted-foreground">
                  {apiKey.prefix}...
                </span>
                <span className="text-muted-foreground">
                  {formatRelativeTime(apiKey.lastUsedAt)}
                </span>
                <span className="text-muted-foreground">
                  {formatDate(apiKey.createdAt)}
                </span>
                <div className="flex justify-end">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => setDeleteId(apiKey.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteId} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete API Key</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this API key? Any applications using this key will lose access immediately. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete Key"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
