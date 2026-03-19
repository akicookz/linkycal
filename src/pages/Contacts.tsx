import { useState, useMemo, useCallback, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Plus,
  Users,
  Search,

  Pencil,
  Trash2,
  Tags,
  Loader2,
  AlertCircle,
  X,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

import { queryClient } from "@/lib/query-client";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ContactTag {
  id: string;
  name: string;
  color: string | null;
}

interface Contact {
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
}

interface Tag {
  id: string;
  projectId: string;
  name: string;
  color: string | null;
  createdAt: string;
}

interface ContactFormData {
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

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

const EMPTY_FORM: ContactFormData = { name: "", email: "", phone: "", notes: "" };

// ─── Component ───────────────────────────────────────────────────────────────

export default function Contacts() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  // ─── State ───
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebounce(searchInput, 300);
  const [activeTagId, setActiveTagId] = useState<string | null>(null);

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createForm, setCreateForm] = useState<ContactFormData>(EMPTY_FORM);

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [editForm, setEditForm] = useState<ContactFormData>(EMPTY_FORM);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingContact, setDeletingContact] = useState<Contact | null>(null);

  const [manageTagsOpen, setManageTagsOpen] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("#6366f1");

  // ─── Queries ───

  const {
    data: contactsData,
    isLoading: loadingContacts,
    isError: errorContacts,
  } = useQuery<Contact[]>({
    queryKey: ["projects", projectId, "contacts", { search: debouncedSearch, tagId: activeTagId }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (activeTagId) params.set("tagId", activeTagId);
      const res = await fetch(`/api/projects/${projectId}/contacts?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch contacts");
      const data = await res.json();
      return data.contacts ?? [];
    },
    enabled: !!projectId,
  });

  const { data: tags = [], isLoading: loadingTags } = useQuery<Tag[]>({
    queryKey: ["projects", projectId, "tags"],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/tags`);
      if (!res.ok) throw new Error("Failed to fetch tags");
      const data = await res.json();
      return data.tags ?? [];
    },
    enabled: !!projectId,
  });

  const contacts = contactsData ?? [];
  // tags is directly available from the query above

  // ─── Mutations ───

  const createMutation = useMutation({
    mutationFn: async (data: ContactFormData) => {
      const res = await fetch(`/api/projects/${projectId}/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          email: data.email || undefined,
          phone: data.phone || undefined,
          notes: data.notes || undefined,
        }),
      });
      if (!res.ok) throw new Error("Failed to create contact");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects", projectId, "contacts"] });
      setCreateDialogOpen(false);
      setCreateForm(EMPTY_FORM);
    },
  });

  const editMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: ContactFormData }) => {
      const res = await fetch(`/api/projects/${projectId}/contacts/${id}`, {
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
      queryClient.invalidateQueries({ queryKey: ["projects", projectId, "contacts"] });
      setEditDialogOpen(false);
      setEditingContact(null);
      setEditForm(EMPTY_FORM);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/projects/${projectId}/contacts/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete contact");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects", projectId, "contacts"] });
      setDeleteDialogOpen(false);
      setDeletingContact(null);
    },
  });

  const createTagMutation = useMutation({
    mutationFn: async (data: { name: string; color?: string }) => {
      const res = await fetch(`/api/projects/${projectId}/tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create tag");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects", projectId, "tags"] });
      setNewTagName("");
      setNewTagColor("#6366f1");
    },
  });

  const deleteTagMutation = useMutation({
    mutationFn: async (tagId: string) => {
      const res = await fetch(`/api/projects/${projectId}/tags/${tagId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete tag");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects", projectId, "tags"] });
      queryClient.invalidateQueries({ queryKey: ["projects", projectId, "contacts"] });
      if (activeTagId) setActiveTagId(null);
    },
  });

  // ─── Handlers ───

  const openEditDialog = useCallback((contact: Contact) => {
    setEditingContact(contact);
    setEditForm({
      name: contact.name,
      email: contact.email ?? "",
      phone: contact.phone ?? "",
      notes: contact.notes ?? "",
    });
    setEditDialogOpen(true);
  }, []);

  const openDeleteDialog = useCallback((contact: Contact) => {
    setDeletingContact(contact);
    setDeleteDialogOpen(true);
  }, []);

  function handleCreateSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!createForm.name.trim()) return;
    createMutation.mutate(createForm);
  }

  function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingContact || !editForm.name.trim()) return;
    editMutation.mutate({ id: editingContact.id, data: editForm });
  }

  function handleCreateTag(e: React.FormEvent) {
    e.preventDefault();
    if (!newTagName.trim()) return;
    createTagMutation.mutate({
      name: newTagName.trim(),
      color: newTagColor || undefined,
    });
  }

  function navigateToContact(contactId: string) {
    navigate(`/app/projects/${projectId}/contacts/${contactId}`);
  }

  // ─── Description ───

  const headerDescription = useMemo(() => {
    if (loadingContacts) return "Loading contacts...";
    if (errorContacts) return "Failed to load contacts";
    const count = contacts.length;
    return `${count} contact${count !== 1 ? "s" : ""}`;
  }, [loadingContacts, errorContacts, contacts.length]);

  // ─── Render helpers ───

  function renderSkeletonRows() {
    return (
      <div className="space-y-1 px-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="py-3 flex items-center gap-4">
            <Skeleton className="h-9 w-9 rounded-full shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-48" />
            </div>
            <Skeleton className="h-4 w-24 hidden sm:block" />
            <Skeleton className="h-5 w-20 hidden md:block" />
            <Skeleton className="h-4 w-20 hidden lg:block" />
            <Skeleton className="h-8 w-20" />
          </div>
        ))}
      </div>
    );
  }

  function renderEmptyState() {
    if (debouncedSearch || activeTagId) {
      return (
        <div className="flex flex-col items-center justify-center py-16">
          <Search className="h-10 w-10 text-muted-foreground mb-4" />
          <p className="text-sm font-medium text-foreground mb-1">No contacts found</p>
          <p className="text-sm text-muted-foreground">
            Try adjusting your search or filter criteria.
          </p>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Users className="h-10 w-10 text-muted-foreground mb-4" />
        <p className="text-sm font-medium text-foreground mb-1">No contacts yet</p>
        <p className="text-sm text-muted-foreground mb-4">
          Contacts are created automatically from form submissions and bookings.
        </p>
        <Button size="sm" onClick={() => setCreateDialogOpen(true)}>
          <Plus className="h-4 w-4" />
          Add Contact
        </Button>
      </div>
    );
  }

  function renderErrorState() {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <AlertCircle className="h-10 w-10 text-destructive mb-4" />
        <p className="text-sm font-medium text-foreground mb-1">Failed to load contacts</p>
        <p className="text-sm text-muted-foreground">Please try refreshing the page.</p>
      </div>
    );
  }

  function renderTable() {
    if (contacts.length === 0) return renderEmptyState();

    return (
      <div className="space-y-1 px-6">
        {contacts.map((contact) => (
          <div key={contact.id}>
            <div className="flex items-center gap-4 py-3">
              {/* Avatar */}
              <div
                className="h-10 w-10 rounded-full flex items-center justify-center text-white text-sm font-semibold shrink-0 cursor-pointer"
                style={{ backgroundColor: getAvatarColor(contact.name) }}
                onClick={() => navigateToContact(contact.id)}
              >
                {getInitial(contact.name)}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  <button
                    type="button"
                    className="hover:underline text-left"
                    onClick={() => navigateToContact(contact.id)}
                  >
                    {contact.name}
                  </button>
                  {contact.email && (
                    <span className="font-normal text-muted-foreground ml-1.5 text-xs">{contact.email}</span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {contact.phone ? `${contact.phone} · ` : ""}
                  Added {formatDate(contact.createdAt)}
                  {contact.tags.length > 0 && (
                    <span className="ml-2 inline-flex gap-1">
                      {contact.tags.slice(0, 3).map((tag) => (
                        <span
                          key={tag.id}
                          className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                          style={{
                            backgroundColor: `${tag.color ?? "#6366f1"}15`,
                            color: tag.color ?? "#6366f1",
                          }}
                        >
                          {tag.name}
                        </span>
                      ))}
                      {contact.tags.length > 3 && (
                        <span className="text-[10px] text-muted-foreground">+{contact.tags.length - 3}</span>
                      )}
                    </span>
                  )}
                </p>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2.5 text-xs"
                  onClick={() => openEditDialog(contact)}
                >
                  <Pencil className="h-3 w-3" />
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2.5 text-xs text-destructive hover:text-destructive"
                  onClick={() => openDeleteDialog(contact)}
                >
                  <Trash2 className="h-3 w-3" />
                  Delete
                </Button>
              </div>
            </div>

          </div>
        ))}
      </div>
    );
  }

  // ─── Contact form fields (shared between create & edit) ───

  function renderContactFormFields(
    form: ContactFormData,
    setForm: React.Dispatch<React.SetStateAction<ContactFormData>>,
  ) {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="contact-name">Name *</Label>
          <Input
            id="contact-name"
            placeholder="John Doe"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="contact-email">Email</Label>
          <Input
            id="contact-email"
            type="email"
            placeholder="john@example.com"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="contact-phone">Phone</Label>
          <Input
            id="contact-phone"
            type="tel"
            placeholder="+1 (555) 123-4567"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="contact-notes">Notes</Label>
          <textarea
            id="contact-notes"
            placeholder="Any additional notes..."
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            rows={3}
            className="flex w-full rounded-[12px] border border-border bg-white px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 resize-none"
          />
        </div>
      </div>
    );
  }

  // ─── Render ───

  return (
    <div>
      <PageHeader title="Contacts" description={headerDescription}>
        <Button variant="outline" onClick={() => setManageTagsOpen(true)}>
          <Tags className="h-4 w-4" />
          Manage Tags
        </Button>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="h-4 w-4" />
          Add Contact
        </Button>
      </PageHeader>

      {/* Search bar */}
      <div className="mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search contacts by name, email, or phone..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9"
          />
          {searchInput && (
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setSearchInput("")}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Tag filter pills */}
      {!loadingTags && tags.length > 0 && (
        <div className="flex items-center gap-2 mb-6 flex-wrap">
          <button
            type="button"
            className={cn(
              "inline-flex items-center rounded-full px-3 py-1 text-xs font-medium border transition-colors",
              activeTagId === null
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-muted-foreground border-border hover:bg-accent",
            )}
            onClick={() => setActiveTagId(null)}
          >
            All
          </button>
          {tags.map((tag) => (
            <button
              key={tag.id}
              type="button"
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition-colors",
                activeTagId === tag.id
                  ? "ring-2 ring-ring ring-offset-1"
                  : "hover:bg-accent",
              )}
              style={{
                backgroundColor: activeTagId === tag.id ? `${tag.color ?? "#6366f1"}20` : undefined,
                borderColor: tag.color ?? "#e2e8f0",
                color: tag.color ?? undefined,
              }}
              onClick={() => setActiveTagId(activeTagId === tag.id ? null : tag.id)}
            >
              <span
                className="h-2 w-2 rounded-full shrink-0"
                style={{ backgroundColor: tag.color ?? "#94a3b8" }}
              />
              {tag.name}
            </button>
          ))}
        </div>
      )}

      {/* Contact list */}
      <Card>
        {loadingContacts && renderSkeletonRows()}
        {errorContacts && !loadingContacts && renderErrorState()}
        {!loadingContacts && !errorContacts && renderTable()}
      </Card>

      {/* ─── Create Contact Dialog ─── */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Contact</DialogTitle>
            <DialogDescription>
              Create a new contact in your project.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateSubmit}>
            {renderContactFormFields(createForm, setCreateForm)}
            <DialogFooter className="mt-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setCreateDialogOpen(false);
                  setCreateForm(EMPTY_FORM);
                }}
                disabled={createMutation.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending || !createForm.name.trim()}>
                {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Create Contact
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ─── Edit Contact Dialog ─── */}
      <Dialog
        open={editDialogOpen}
        onOpenChange={(open) => {
          setEditDialogOpen(open);
          if (!open) {
            setEditingContact(null);
            setEditForm(EMPTY_FORM);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Contact</DialogTitle>
            <DialogDescription>
              Update the contact information.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditSubmit}>
            {renderContactFormFields(editForm, setEditForm)}
            <DialogFooter className="mt-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setEditDialogOpen(false);
                  setEditingContact(null);
                  setEditForm(EMPTY_FORM);
                }}
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

      {/* ─── Delete Confirmation Dialog ─── */}
      <Dialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          setDeleteDialogOpen(open);
          if (!open) setDeletingContact(null);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Contact</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{" "}
              <span className="font-medium text-foreground">{deletingContact?.name}</span>?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteDialogOpen(false);
                setDeletingContact(null);
              }}
              disabled={deleteMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deletingContact && deleteMutation.mutate(deletingContact.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Manage Tags Dialog ─── */}
      <Dialog open={manageTagsOpen} onOpenChange={setManageTagsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manage Tags</DialogTitle>
            <DialogDescription>
              Create and manage tags for organizing your contacts.
            </DialogDescription>
          </DialogHeader>

          {/* Existing tags */}
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {tags.length === 0 && !loadingTags && (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No tags yet. Create one below.
              </p>
            )}
            {loadingTags && (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 py-2">
                    <Skeleton className="h-4 w-4 rounded-full" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                ))}
              </div>
            )}
            {tags.map((tag) => (
              <div
                key={tag.id}
                className="flex items-center justify-between gap-3 py-2 px-3 rounded-[12px] hover:bg-muted/50 transition-colors group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className="h-3.5 w-3.5 rounded-full shrink-0 border"
                    style={{
                      backgroundColor: tag.color ?? "#94a3b8",
                      borderColor: tag.color ?? "#94a3b8",
                    }}
                  />
                  <span className="text-sm font-medium truncate">{tag.name}</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
                  onClick={() => deleteTagMutation.mutate(tag.id)}
                  disabled={deleteTagMutation.isPending}
                >
                  {deleteTagMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                  Delete
                </Button>
              </div>
            ))}
          </div>

          {/* Create new tag */}
          <form onSubmit={handleCreateTag} className="mt-4 pt-4">
            <p className="text-sm font-medium mb-3">Create new tag</p>
            <div className="flex items-end gap-3">
              <div className="flex-1 space-y-2">
                <Label htmlFor="tag-name">Name</Label>
                <Input
                  id="tag-name"
                  placeholder="e.g. VIP, Lead, Customer"
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tag-color">Color</Label>
                <div className="flex items-center gap-2">
                  <div
                    className="h-10 w-10 rounded-[12px] border shrink-0"
                    style={{ backgroundColor: newTagColor }}
                  />
                  <Input
                    id="tag-color"
                    placeholder="#6366f1"
                    value={newTagColor}
                    onChange={(e) => setNewTagColor(e.target.value)}
                    className="w-24"
                  />
                </div>
              </div>
              <Button
                type="submit"
                size="sm"
                className="shrink-0"
                disabled={createTagMutation.isPending || !newTagName.trim()}
              >
                {createTagMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Add
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
