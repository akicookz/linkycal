import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Plus,
  FileText,
  Copy,
  Pencil,
  Trash2,
  Loader2,
  AlertCircle,
  Check,
  BarChart3,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { queryClient } from "@/lib/query-client";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Form {
  id: string;
  projectId: string;
  name: string;
  slug: string;
  type: "multi_step" | "single";
  status: "draft" | "active" | "archived";
  settings: unknown;
  createdAt: string;
  updatedAt: string;
}

interface CreateFormData {
  name: string;
  slug: string;
  type: "multi_step" | "single";
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function statusVariant(status: Form["status"]) {
  switch (status) {
    case "active":
      return "success" as const;
    case "archived":
      return "warning" as const;
    default:
      return "secondary" as const;
  }
}

function typeLabel(type: Form["type"]) {
  return type === "multi_step" ? "Multi-Step" : "Single Page";
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const defaultFormData: CreateFormData = {
  name: "",
  slug: "",
  type: "single",
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function Forms() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<CreateFormData>(defaultFormData);
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // ─── Queries ─────────────────────────────────────────────────────────────

  const {
    data: formsData,
    isLoading,
    isError,
  } = useQuery<Form[]>({
    queryKey: ["projects", projectId, "forms"],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/forms`);
      if (!res.ok) throw new Error("Failed to fetch forms");
      const data = await res.json();
      return data.forms ?? [];
    },
    enabled: !!projectId,
  });

  const forms = formsData ?? [];

  // ─── Mutations ───────────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: async (data: CreateFormData) => {
      const res = await fetch(`/api/projects/${projectId}/forms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to create form");
      }
      const json = await res.json();
      return json;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["projects", projectId, "forms"] });
      closeCreateDialog();
      if (data?.form?.id) {
        navigate(`/app/projects/${projectId}/forms/${data.form.id}`);
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/projects/${projectId}/forms/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete form");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects", projectId, "forms"] });
      setDeleteDialogOpen(false);
      setDeletingId(null);
    },
  });

  const toggleStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "draft" | "active" }) => {
      const res = await fetch(`/api/projects/${projectId}/forms/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Failed to update form status");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects", projectId, "forms"] });
    },
  });

  // ─── Auto slug ───────────────────────────────────────────────────────────

  useEffect(() => {
    if (!slugManuallyEdited) {
      setFormData((prev) => ({ ...prev, slug: generateSlug(prev.name) }));
    }
  }, [formData.name, slugManuallyEdited]);

  // ─── Handlers ────────────────────────────────────────────────────────────

  function openCreateDialog() {
    setFormData(defaultFormData);
    setSlugManuallyEdited(false);
    setCreateDialogOpen(true);
  }

  function closeCreateDialog() {
    setCreateDialogOpen(false);
    setFormData(defaultFormData);
    setSlugManuallyEdited(false);
  }

  function openDeleteDialog(id: string) {
    setDeletingId(id);
    setDeleteDialogOpen(true);
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    createMutation.mutate(formData);
  }

  function handleCopyEmbedLink(form: Form) {
    const embedSnippet = `<script src="${window.location.origin}/embed/form/${form.slug}" data-linkycal-form="${form.slug}"></script>`;
    navigator.clipboard.writeText(embedSnippet);
    setCopiedId(form.id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  return (
    <div>
      <PageHeader title="Forms" description="Build forms and collect responses">
        <Button onClick={openCreateDialog} size="sm">
          <Plus className="h-4 w-4" />
          New Form
        </Button>
      </PageHeader>

      {/* Loading */}
      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <div className="space-y-3">
                  <Skeleton className="h-5 w-36" />
                  <div className="flex gap-2">
                    <Skeleton className="h-5 w-16" />
                    <Skeleton className="h-5 w-14" />
                  </div>
                  <Skeleton className="h-4 w-28" />
                  <div className="flex justify-between pt-2">
                    <Skeleton className="h-8 w-20" />
                    <Skeleton className="h-8 w-8" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Error */}
      {isError && (
        <div className="flex flex-col items-center justify-center rounded-[20px] border border-dashed py-16">
          <AlertCircle className="h-10 w-10 text-destructive mb-4" />
          <p className="text-sm font-medium text-foreground mb-1">
            Failed to load forms
          </p>
          <p className="text-sm text-muted-foreground">
            Please try refreshing the page.
          </p>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !isError && forms.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-[20px] border border-dashed py-16">
          <FileText className="h-10 w-10 text-muted-foreground mb-4" />
          <p className="text-sm font-medium text-foreground mb-1">
            No forms yet
          </p>
          <p className="text-sm text-muted-foreground mb-4">
            Create a form to start collecting responses.
          </p>
          <Button onClick={openCreateDialog} size="sm">
            <Plus className="h-4 w-4" />
            New Form
          </Button>
        </div>
      )}

      {/* Forms Grid */}
      {!isLoading && !isError && forms.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {forms.map((form) => (
            <Card
              key={form.id}
              className={`relative transition-opacity ${form.status === "archived" ? "opacity-60" : ""}`}
            >
              <CardContent>
                {/* Name + status toggle */}
                <div className="flex items-start justify-between mb-3">
                  <h3 className="text-sm font-semibold text-foreground truncate pr-2">
                    {form.name}
                  </h3>
                  <Switch
                    checked={form.status === "active"}
                    onCheckedChange={(checked) =>
                      toggleStatusMutation.mutate({
                        id: form.id,
                        status: checked ? "active" : "draft",
                      })
                    }
                  />
                </div>

                {/* Badges */}
                <div className="flex items-center gap-1.5 mb-3">
                  <Badge variant={statusVariant(form.status)} className="text-[11px] px-2 py-0.5">
                    {form.status}
                  </Badge>
                  <Badge variant="secondary" className="text-[11px] px-2 py-0.5">
                    {typeLabel(form.type)}
                  </Badge>
                </div>

                {/* Created date */}
                <p className="text-xs text-muted-foreground mb-3">
                  Created {formatDate(form.createdAt)}
                </p>

                {/* Actions */}
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2.5 text-xs"
                    onClick={() => handleCopyEmbedLink(form)}
                  >
                    {copiedId === form.id ? (
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                    {copiedId === form.id ? "Copied" : "Embed"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2.5 text-xs"
                    onClick={() =>
                      navigate(`/app/projects/${projectId}/forms/${form.id}/responses`)
                    }
                  >
                    <BarChart3 className="h-3.5 w-3.5" />
                    Responses
                  </Button>
                  <div className="flex-1" />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2.5 text-xs"
                    onClick={() =>
                      navigate(`/app/projects/${projectId}/forms/${form.id}`)
                    }
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2.5 text-xs text-destructive hover:text-destructive"
                    onClick={() => openDeleteDialog(form.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Form Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Form</DialogTitle>
            <DialogDescription>
              Create a new form to collect responses from your users.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="form-name">Name</Label>
              <Input
                id="form-name"
                placeholder="e.g. Contact Form"
                value={formData.name}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, name: e.target.value }))
                }
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="form-slug">Slug</Label>
              <Input
                id="form-slug"
                placeholder="contact-form"
                value={formData.slug}
                onChange={(e) => {
                  setSlugManuallyEdited(true);
                  setFormData((prev) => ({ ...prev, slug: e.target.value }));
                }}
                required
              />
              <p className="text-[11px] text-muted-foreground">
                URL-friendly identifier. Auto-generated from name.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="form-type">Type</Label>
              <Select
                value={formData.type}
                onValueChange={(val) =>
                  setFormData((prev) => ({
                    ...prev,
                    type: val as "single" | "multi_step",
                  }))
                }
              >
                <SelectTrigger id="form-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="single">Single Page</SelectItem>
                  <SelectItem value="multi_step">Multi-Step</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {createMutation.isError && (
              <p className="text-sm text-destructive">
                {createMutation.error?.message ?? "Something went wrong."}
              </p>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={closeCreateDialog}
                disabled={createMutation.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                Create Form
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Form</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this form? This action cannot be
              undone and will remove all associated responses.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteDialogOpen(false);
                setDeletingId(null);
              }}
              disabled={deleteMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deletingId && deleteMutation.mutate(deletingId)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
