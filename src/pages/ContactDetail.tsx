import { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  ArrowLeft,
  Mail,
  Phone,
  StickyNote,
  Pencil,
  CalendarCheck,
  X as XIcon,
  FileText,
  Tag,
  Plus,
  Loader2,
  AlertCircle,
  Clock,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { queryClient } from "@/lib/query-client";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ContactTag {
  id: string;
  name: string;
  color: string | null;
}

interface ContactActivity {
  id: string;
  contactId: string;
  type: "form_submitted" | "booked" | "cancelled" | "tag_added" | "tag_removed";
  referenceId: string | null;
  metadata: unknown;
  createdAt: string;
}

interface ContactDetail {
  id: string;
  projectId: string;
  name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  metadata: unknown;
  createdAt: string;
  updatedAt: string;
  tags: ContactTag[];
  activity: ContactActivity[];
}

interface TagEntity {
  id: string;
  projectId: string;
  name: string;
  color: string | null;
  createdAt: string;
}

interface EditFormData {
  name: string;
  email: string;
  phone: string;
  notes: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 45%, 45%)`;
}

function getInitial(name: string): string {
  return name.charAt(0).toUpperCase();
}

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;

  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatFullDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function activityIcon(type: ContactActivity["type"]) {
  switch (type) {
    case "booked":
      return <CalendarCheck className="h-4 w-4 text-emerald-600" />;
    case "cancelled":
      return <XIcon className="h-4 w-4 text-destructive" />;
    case "form_submitted":
      return <FileText className="h-4 w-4 text-blue-600" />;
    case "tag_added":
      return <Tag className="h-4 w-4 text-violet-600" />;
    case "tag_removed":
      return <Tag className="h-4 w-4 text-muted-foreground" />;
    default:
      return <Clock className="h-4 w-4 text-muted-foreground" />;
  }
}

function activityDescription(activity: ContactActivity): string {
  const meta = activity.metadata as Record<string, unknown> | null;
  switch (activity.type) {
    case "booked":
      return "Booked an appointment";
    case "cancelled":
      return "Cancelled an appointment";
    case "form_submitted":
      return "Submitted a form response";
    case "tag_added":
      return `Tag '${meta?.tagName ?? "unknown"}' added`;
    case "tag_removed":
      return `Tag '${meta?.tagName ?? "unknown"}' removed`;
    default:
      return "Activity recorded";
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ContactDetailPage() {
  const { projectId, contactId } = useParams<{ projectId: string; contactId: string }>();
  const navigate = useNavigate();

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editForm, setEditForm] = useState<EditFormData>({ name: "", email: "", phone: "", notes: "" });
  const [addTagOpen, setAddTagOpen] = useState(false);

  // ─── Queries ───

  const {
    data: contactData,
    isLoading: loadingContact,
    isError: errorContact,
  } = useQuery<ContactDetail>({
    queryKey: ["projects", projectId, "contacts", contactId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/contacts/${contactId}`);
      if (!res.ok) throw new Error("Failed to fetch contact");
      const data = await res.json();
      return data.contact ?? data;
    },
    enabled: !!projectId && !!contactId,
  });

  const { data: allTags = [] } = useQuery<TagEntity[]>({
    queryKey: ["projects", projectId, "tags"],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/tags`);
      if (!res.ok) throw new Error("Failed to fetch tags");
      const data = await res.json();
      return data.tags ?? [];
    },
    enabled: !!projectId,
  });

  const contact = contactData;
  // allTags is directly available from the query above

  // Tags not yet assigned to this contact
  const availableTags = useMemo(() => {
    if (!contact) return allTags;
    const assignedIds = new Set(contact.tags.map((t) => t.id));
    return allTags.filter((t) => !assignedIds.has(t.id));
  }, [allTags, contact]);

  // Quick stats from activity
  const stats = useMemo(() => {
    if (!contact) return { bookings: 0, formSubmissions: 0 };
    return {
      bookings: contact.activity.filter((a) => a.type === "booked").length,
      formSubmissions: contact.activity.filter((a) => a.type === "form_submitted").length,
    };
  }, [contact]);

  // ─── Mutations ───

  const editMutation = useMutation({
    mutationFn: async (data: EditFormData) => {
      const res = await fetch(`/api/projects/${projectId}/contacts/${contactId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          email: data.email || null,
          phone: data.phone || null,
          notes: data.notes || null,
        }),
      });
      if (!res.ok) throw new Error("Failed to update contact");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects", projectId, "contacts", contactId] });
      queryClient.invalidateQueries({ queryKey: ["projects", projectId, "contacts"] });
      setEditDialogOpen(false);
    },
  });

  const addTagMutation = useMutation({
    mutationFn: async (tagId: string) => {
      const res = await fetch(`/api/projects/${projectId}/contacts/${contactId}/tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tagId }),
      });
      if (!res.ok) throw new Error("Failed to add tag");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects", projectId, "contacts", contactId] });
      queryClient.invalidateQueries({ queryKey: ["projects", projectId, "contacts"] });
      setAddTagOpen(false);
    },
  });

  const removeTagMutation = useMutation({
    mutationFn: async (tagId: string) => {
      const res = await fetch(`/api/projects/${projectId}/contacts/${contactId}/tags/${tagId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to remove tag");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects", projectId, "contacts", contactId] });
      queryClient.invalidateQueries({ queryKey: ["projects", projectId, "contacts"] });
    },
  });

  // ─── Handlers ───

  function openEditDialog() {
    if (!contact) return;
    setEditForm({
      name: contact.name,
      email: contact.email ?? "",
      phone: contact.phone ?? "",
      notes: contact.notes ?? "",
    });
    setEditDialogOpen(true);
  }

  function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editForm.name.trim()) return;
    editMutation.mutate(editForm);
  }

  function goBack() {
    navigate(`/app/projects/${projectId}/contacts`);
  }

  // ─── Loading state ───

  if (loadingContact) {
    return (
      <div>
        <PageHeader title="Contact" description="Loading contact details...">
          <Button variant="outline" onClick={goBack}>
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        </PageHeader>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <Skeleton className="h-6 w-48" />
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-4">
                  <Skeleton className="h-16 w-16 rounded-full" />
                  <div className="space-y-2">
                    <Skeleton className="h-6 w-40" />
                    <Skeleton className="h-4 w-56" />
                  </div>
                </div>
                <div className="pt-4" />
                <Skeleton className="h-4 w-64" />
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-4 w-80" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <Skeleton className="h-5 w-32" />
              </CardHeader>
              <CardContent className="space-y-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                    <div className="space-y-1 flex-1">
                      <Skeleton className="h-4 w-48" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <Skeleton className="h-5 w-16" />
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  <Skeleton className="h-6 w-16 rounded-full" />
                  <Skeleton className="h-6 w-20 rounded-full" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <Skeleton className="h-5 w-24" />
              </CardHeader>
              <CardContent className="space-y-3">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  // ─── Error state ───

  if (errorContact || !contact) {
    return (
      <div>
        <PageHeader title="Contact" description="Something went wrong">
          <Button variant="outline" onClick={goBack}>
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        </PageHeader>

        <div className="flex flex-col items-center justify-center rounded-[20px] border py-16">
          <AlertCircle className="h-10 w-10 text-destructive mb-4" />
          <p className="text-sm font-medium text-foreground mb-1">
            {errorContact ? "Failed to load contact" : "Contact not found"}
          </p>
          <p className="text-sm text-muted-foreground mb-4">
            {errorContact
              ? "Please try refreshing the page."
              : "This contact may have been deleted."}
          </p>
          <Button variant="outline" size="sm" onClick={goBack}>
            Back to Contacts
          </Button>
        </div>
      </div>
    );
  }

  // ─── Sorted activity (most recent first) ───

  const sortedActivity = [...contact.activity].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  // ─── Render ───

  return (
    <div>
      <PageHeader
        title={contact.name}
        description={`Added ${formatFullDate(contact.createdAt)}`}
      >
        <Button variant="outline" onClick={goBack}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <Button variant="outline" onClick={openEditDialog}>
          <Pencil className="h-4 w-4" />
          Edit
        </Button>
      </PageHeader>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
        {/* ─── Main Column ─── */}
        <div className="space-y-6">
          {/* Contact Info Card */}
          <Card>
            <CardHeader>
              <CardTitle>Contact Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Avatar & Name */}
              <div className="flex items-center gap-4">
                <div
                  className="h-14 w-14 rounded-full flex items-center justify-center text-white text-xl font-semibold shrink-0"
                  style={{ backgroundColor: getAvatarColor(contact.name) }}
                >
                  {getInitial(contact.name)}
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-foreground">{contact.name}</h2>
                  {contact.email && (
                    <p className="text-sm text-muted-foreground">{contact.email}</p>
                  )}
                </div>
              </div>

              {/* Details */}
              <div className="space-y-3">
                {/* Email */}
                <div className="flex items-center gap-3 text-sm">
                  <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                  {contact.email ? (
                    <a
                      href={`mailto:${contact.email}`}
                      className="text-foreground hover:underline"
                    >
                      {contact.email}
                    </a>
                  ) : (
                    <span className="text-muted-foreground">No email provided</span>
                  )}
                </div>

                {/* Phone */}
                <div className="flex items-center gap-3 text-sm">
                  <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                  {contact.phone ? (
                    <a
                      href={`tel:${contact.phone}`}
                      className="text-foreground hover:underline"
                    >
                      {contact.phone}
                    </a>
                  ) : (
                    <span className="text-muted-foreground">No phone provided</span>
                  )}
                </div>

                {/* Notes */}
                <div className="flex items-start gap-3 text-sm">
                  <StickyNote className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                  {contact.notes ? (
                    <p className="text-foreground whitespace-pre-wrap">{contact.notes}</p>
                  ) : (
                    <span className="text-muted-foreground">No notes</span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Activity Timeline */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                Activity Timeline
              </CardTitle>
            </CardHeader>
            <CardContent>
              {sortedActivity.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8">
                  <Clock className="h-8 w-8 text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground">No activity yet</p>
                </div>
              ) : (
                <div className="relative">
                  {/* Timeline line */}
                  <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />

                  <div className="space-y-0">
                    {sortedActivity.map((activity) => (
                      <div key={activity.id} className="relative flex items-start gap-4 pb-6 last:pb-0">
                        {/* Icon dot */}
                        <div className="relative z-10 flex h-8 w-8 items-center justify-center rounded-full bg-card border shrink-0">
                          {activityIcon(activity.type)}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0 pt-1">
                          <p className="text-sm text-foreground">
                            {activityDescription(activity)}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {relativeTime(activity.createdAt)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ─── Sidebar ─── */}
        <div className="space-y-6">
          {/* Tags Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Tags</span>
                <Popover open={addTagOpen} onOpenChange={setAddTagOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
                      <Plus className="h-3.5 w-3.5" />
                      Add Tag
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-56 p-2">
                    <p className="text-xs font-medium text-muted-foreground px-2 py-1.5 mb-1">
                      Available Tags
                    </p>
                    {availableTags.length === 0 ? (
                      <p className="text-xs text-muted-foreground px-2 py-3 text-center">
                        {allTags.length === 0
                          ? "No tags created yet. Create tags from the Contacts page."
                          : "All tags are already assigned."}
                      </p>
                    ) : (
                      <div className="space-y-0.5 max-h-48 overflow-y-auto">
                        {availableTags.map((tag) => (
                          <button
                            key={tag.id}
                            type="button"
                            className="flex items-center gap-2 w-full px-2 py-1.5 rounded-[8px] text-sm hover:bg-accent transition-colors text-left"
                            onClick={() => addTagMutation.mutate(tag.id)}
                            disabled={addTagMutation.isPending}
                          >
                            <span
                              className="h-2.5 w-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: tag.color ?? "#94a3b8" }}
                            />
                            <span className="truncate">{tag.name}</span>
                            {addTagMutation.isPending && addTagMutation.variables === tag.id && (
                              <Loader2 className="h-3 w-3 animate-spin ml-auto" />
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </PopoverContent>
                </Popover>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {contact.tags.length === 0 ? (
                <p className="text-sm text-muted-foreground">No tags assigned</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {contact.tags.map((tag) => (
                    <span
                      key={tag.id}
                      className="inline-flex items-center gap-1.5 rounded-full pl-2.5 pr-1.5 py-1 text-xs font-medium border group"
                      style={{
                        backgroundColor: tag.color ? `${tag.color}15` : undefined,
                        borderColor: tag.color ?? "#e2e8f0",
                        color: tag.color ?? undefined,
                      }}
                    >
                      <span
                        className="h-1.5 w-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: tag.color ?? "#94a3b8" }}
                      />
                      {tag.name}
                      <button
                        type="button"
                        className="ml-0.5 rounded-full p-0.5 hover:bg-black/10 transition-colors"
                        onClick={() => removeTagMutation.mutate(tag.id)}
                        disabled={removeTagMutation.isPending}
                      >
                        <XIcon className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Stats */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Stats</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between rounded-[12px] bg-muted/50 px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <CalendarCheck className="h-4 w-4 text-emerald-600" />
                  <span className="text-sm text-foreground">Bookings</span>
                </div>
                <span className="text-sm font-semibold text-foreground">{stats.bookings}</span>
              </div>
              <div className="flex items-center justify-between rounded-[12px] bg-muted/50 px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <FileText className="h-4 w-4 text-blue-600" />
                  <span className="text-sm text-foreground">Form Submissions</span>
                </div>
                <span className="text-sm font-semibold text-foreground">
                  {stats.formSubmissions}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Metadata */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground font-normal">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs text-muted-foreground">
              <div className="flex justify-between">
                <span>Created</span>
                <span>{formatFullDate(contact.createdAt)}</span>
              </div>
              <div className="flex justify-between">
                <span>Last updated</span>
                <span>{relativeTime(contact.updatedAt)}</span>
              </div>
              <div className="flex justify-between">
                <span>Total activity</span>
                <span>{contact.activity.length} events</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ─── Edit Dialog ─── */}
      <Dialog
        open={editDialogOpen}
        onOpenChange={(open) => {
          setEditDialogOpen(open);
          if (!open) {
            setEditForm({ name: "", email: "", phone: "", notes: "" });
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Contact</DialogTitle>
            <DialogDescription>Update the contact information.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditSubmit}>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Name *</Label>
                <Input
                  id="edit-name"
                  placeholder="John Doe"
                  value={editForm.name}
                  onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-email">Email</Label>
                <Input
                  id="edit-email"
                  type="email"
                  placeholder="john@example.com"
                  value={editForm.email}
                  onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-phone">Phone</Label>
                <Input
                  id="edit-phone"
                  type="tel"
                  placeholder="+1 (555) 123-4567"
                  value={editForm.phone}
                  onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-notes">Notes</Label>
                <textarea
                  id="edit-notes"
                  placeholder="Any additional notes..."
                  value={editForm.notes}
                  onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={3}
                  className="flex w-full rounded-[12px] border border-border bg-white px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 resize-none"
                />
              </div>
            </div>
            <DialogFooter className="mt-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditDialogOpen(false)}
                disabled={editMutation.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={editMutation.isPending || !editForm.name.trim()}>
                {editMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
