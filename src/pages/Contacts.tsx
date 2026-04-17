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
  Loader,
  AlertCircle,
  X,
  Filter,
  ListIcon,
  LayoutGrid,
  Bookmark,
  Save,
  ChevronDown,
  Check,
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { queryClient } from "@/lib/query-client";
import { cn } from "@/lib/utils";
import ContactsKanban from "./ContactsKanban";

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

type ActivityType =
  | "form_submitted"
  | "booked"
  | "cancelled"
  | "tag_added"
  | "tag_removed"
  | "workflow_researched";

type BookingStatus =
  | "confirmed"
  | "cancelled"
  | "rescheduled"
  | "pending"
  | "declined";

type ViewType = "list" | "kanban";

interface ViewConfig {
  search?: string;
  tagIds?: string[];
  matchAllTags?: boolean;
  activityType?: ActivityType;
  activitySinceDays?: number;
  noActivitySinceDays?: number;
  bookingStatus?: BookingStatus;
  pivotTagIds?: string[];
  showUntagged?: boolean;
}

interface SavedView {
  id: string;
  projectId: string;
  name: string;
  type: ViewType;
  config: ViewConfig | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
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
const EMPTY_CONFIG: ViewConfig = {};

const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = {
  form_submitted: "Submitted a form",
  booked: "Booked",
  cancelled: "Cancelled a booking",
  tag_added: "Tag added",
  tag_removed: "Tag removed",
  workflow_researched: "Researched by workflow",
};

const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  confirmed: "Confirmed",
  cancelled: "Cancelled",
  rescheduled: "Rescheduled",
  pending: "Pending",
  declined: "Declined",
};

function configsEqual(a: ViewConfig, b: ViewConfig): boolean {
  // Preserve explicit `false` so toggling a boolean off still registers
  // as a change vs. a saved view that had it `true`.
  const norm = (c: ViewConfig) =>
    JSON.stringify({
      search: c.search ? c.search : undefined,
      tagIds:
        c.tagIds && c.tagIds.length > 0 ? [...c.tagIds].sort() : undefined,
      matchAllTags: c.matchAllTags ?? undefined,
      activityType: c.activityType,
      activitySinceDays: c.activitySinceDays,
      noActivitySinceDays: c.noActivitySinceDays,
      bookingStatus: c.bookingStatus,
      pivotTagIds:
        c.pivotTagIds && c.pivotTagIds.length > 0
          ? [...c.pivotTagIds].sort()
          : undefined,
      showUntagged: c.showUntagged ?? undefined,
    });
  return norm(a) === norm(b);
}

function activeFilterCount(c: ViewConfig): number {
  let n = 0;
  if (c.tagIds && c.tagIds.length > 0) n++;
  if (c.activityType) n++;
  if (c.activitySinceDays !== undefined) n++;
  if (c.noActivitySinceDays !== undefined) n++;
  if (c.bookingStatus) n++;
  return n;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function Contacts() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  // ─── View / filter state ───
  const [viewType, setViewType] = useState<ViewType>("list");
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [config, setConfig] = useState<ViewConfig>(EMPTY_CONFIG);
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebounce(searchInput, 300);

  // ─── CRUD dialogs ───
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

  // ─── View dialogs ───
  const [saveViewOpen, setSaveViewOpen] = useState(false);
  const [saveViewName, setSaveViewName] = useState("");
  const [viewsMenuOpen, setViewsMenuOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [deleteViewTarget, setDeleteViewTarget] = useState<SavedView | null>(null);

  // ─── Queries ───

  const queryConfig: ViewConfig = useMemo(
    () => ({ ...config, search: debouncedSearch || undefined }),
    [config, debouncedSearch],
  );

  const {
    data: contactsData,
    isLoading: loadingContacts,
    isError: errorContacts,
  } = useQuery<Contact[]>({
    queryKey: ["projects", projectId, "contacts", queryConfig],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (queryConfig.search) params.set("search", queryConfig.search);
      if (queryConfig.tagIds) {
        for (const id of queryConfig.tagIds) params.append("tagIds", id);
      }
      if (queryConfig.matchAllTags) params.set("matchAllTags", "true");
      if (queryConfig.activityType)
        params.set("activityType", queryConfig.activityType);
      if (queryConfig.activitySinceDays !== undefined)
        params.set("activitySinceDays", String(queryConfig.activitySinceDays));
      if (queryConfig.noActivitySinceDays !== undefined)
        params.set(
          "noActivitySinceDays",
          String(queryConfig.noActivitySinceDays),
        );
      if (queryConfig.bookingStatus)
        params.set("bookingStatus", queryConfig.bookingStatus);
      const res = await fetch(
        `/api/projects/${projectId}/contacts?${params.toString()}`,
      );
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

  const { data: savedViews = [] } = useQuery<SavedView[]>({
    queryKey: ["projects", projectId, "contact-views"],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/contact-views`);
      if (!res.ok) throw new Error("Failed to fetch views");
      const data = await res.json();
      return data.views ?? [];
    },
    enabled: !!projectId,
  });

  const contacts = contactsData ?? [];

  const activeView = useMemo(
    () => savedViews.find((v) => v.id === activeViewId) ?? null,
    [savedViews, activeViewId],
  );

  const isDirty = useMemo(() => {
    const liveConfig: ViewConfig = { ...config, search: searchInput || undefined };
    if (!activeView) {
      return (
        activeFilterCount(liveConfig) > 0 ||
        viewType !== "list" ||
        !!searchInput
      );
    }
    return (
      activeView.type !== viewType ||
      !configsEqual(activeView.config ?? {}, liveConfig)
    );
  }, [activeView, config, viewType, searchInput]);

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
    },
  });

  const createViewMutation = useMutation({
    mutationFn: async (payload: {
      name: string;
      type: ViewType;
      config: ViewConfig;
    }) => {
      const res = await fetch(`/api/projects/${projectId}/contact-views`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to save view");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: ["projects", projectId, "contact-views"],
      });
      if (data?.view?.id) setActiveViewId(data.view.id);
      setSaveViewOpen(false);
      setSaveViewName("");
    },
  });

  const updateViewMutation = useMutation({
    mutationFn: async (payload: {
      id: string;
      type: ViewType;
      config: ViewConfig;
    }) => {
      const res = await fetch(
        `/api/projects/${projectId}/contact-views/${payload.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: payload.type,
            config: payload.config,
          }),
        },
      );
      if (!res.ok) throw new Error("Failed to update view");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["projects", projectId, "contact-views"],
      });
    },
  });

  const deleteViewMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(
        `/api/projects/${projectId}/contact-views/${id}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error("Failed to delete view");
      return res.json();
    },
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({
        queryKey: ["projects", projectId, "contact-views"],
      });
      if (activeViewId === id) {
        setActiveViewId(null);
        setConfig(EMPTY_CONFIG);
        setSearchInput("");
        setViewType("list");
      }
      setDeleteViewTarget(null);
    },
  });

  // ─── Handlers ───

  const applyView = useCallback((view: SavedView | null) => {
    if (!view) {
      setActiveViewId(null);
      setConfig(EMPTY_CONFIG);
      setSearchInput("");
      setViewType("list");
      return;
    }
    setActiveViewId(view.id);
    const cfg = view.config ?? {};
    setConfig({ ...cfg, search: undefined });
    setSearchInput(cfg.search ?? "");
    setViewType(view.type);
  }, []);

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

  function handleSaveView(e: React.FormEvent) {
    e.preventDefault();
    if (!saveViewName.trim()) return;
    createViewMutation.mutate({
      name: saveViewName.trim(),
      type: viewType,
      config: { ...config, search: searchInput || undefined },
    });
  }

  function handleUpdateActiveView() {
    if (!activeView) return;
    updateViewMutation.mutate({
      id: activeView.id,
      type: viewType,
      config: { ...config, search: searchInput || undefined },
    });
  }

  function navigateToContact(contactId: string) {
    navigate(`/app/projects/${projectId}/contacts/${contactId}`);
  }

  function toggleTagFilter(tagId: string) {
    const current = new Set(config.tagIds ?? []);
    if (current.has(tagId)) current.delete(tagId);
    else current.add(tagId);
    setConfig((c) => ({
      ...c,
      tagIds: current.size === 0 ? undefined : Array.from(current),
    }));
  }

  function togglePivotTag(tagId: string) {
    const current = new Set(config.pivotTagIds ?? []);
    if (current.has(tagId)) current.delete(tagId);
    else current.add(tagId);
    setConfig((c) => ({
      ...c,
      pivotTagIds: current.size === 0 ? undefined : Array.from(current),
    }));
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
    const hasFilters = searchInput || activeFilterCount(config) > 0;
    if (hasFilters) {
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
              <div
                className="h-10 w-10 rounded-full flex items-center justify-center text-white text-sm font-semibold shrink-0 cursor-pointer"
                style={{ backgroundColor: getAvatarColor(contact.name) }}
                onClick={() => navigateToContact(contact.id)}
              >
                {getInitial(contact.name)}
              </div>

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

  const filterCount = activeFilterCount(config);
  const allTagsForKanban = useMemo(
    () =>
      tags.map((t) => ({ id: t.id, name: t.name, color: t.color })),
    [tags],
  );

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

      {/* Toolbar: views + view-type tabs + filters */}
      <div className="flex items-center flex-wrap gap-2 mb-4">
        {/* Saved views dropdown */}
        <Popover open={viewsMenuOpen} onOpenChange={setViewsMenuOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="h-9">
              <Bookmark className="h-4 w-4" />
              {activeView ? activeView.name : "All contacts"}
              {isDirty && activeView && (
                <span className="ml-1 text-xs text-muted-foreground">·</span>
              )}
              <ChevronDown className="h-4 w-4 opacity-60" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 p-2">
            <div className="space-y-0.5">
              <button
                type="button"
                onClick={() => {
                  applyView(null);
                  setViewsMenuOpen(false);
                }}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-[10px] px-2.5 py-2 text-sm hover:bg-accent text-left",
                  activeViewId === null && "bg-accent",
                )}
              >
                <span className="flex items-center gap-2">
                  <Users className="h-3.5 w-3.5 text-muted-foreground" />
                  All contacts
                </span>
                {activeViewId === null && <Check className="h-4 w-4" />}
              </button>
              {savedViews.length > 0 && (
                <div className="my-1 h-px bg-border" />
              )}
              {savedViews.map((v) => (
                <div
                  key={v.id}
                  className={cn(
                    "group flex items-center gap-1 rounded-[10px] pr-1 hover:bg-accent",
                    activeViewId === v.id && "bg-accent",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => {
                      applyView(v);
                      setViewsMenuOpen(false);
                    }}
                    className="flex flex-1 items-center justify-between gap-2 rounded-[10px] px-2.5 py-2 text-sm text-left"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      {v.type === "kanban" ? (
                        <LayoutGrid className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      ) : (
                        <ListIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      )}
                      <span className="truncate">{v.name}</span>
                    </span>
                    {activeViewId === v.id && (
                      <Check className="h-4 w-4 shrink-0" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteViewTarget(v);
                      setViewsMenuOpen(false);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1.5 rounded-md text-muted-foreground hover:text-destructive transition-opacity"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {/* View type tabs */}
        <Tabs
          value={viewType}
          onValueChange={(v) => setViewType(v as ViewType)}
        >
          <TabsList className="h-9">
            <TabsTrigger value="list" className="h-7 px-2.5">
              <ListIcon className="h-3.5 w-3.5" />
              List
            </TabsTrigger>
            <TabsTrigger value="kanban" className="h-7 px-2.5">
              <LayoutGrid className="h-3.5 w-3.5" />
              Kanban
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Filters popover */}
        <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="h-9">
              <Filter className="h-4 w-4" />
              Filters
              {filterCount > 0 && (
                <span className="inline-flex items-center justify-center h-5 min-w-5 rounded-full bg-primary text-primary-foreground text-[10px] font-medium px-1.5">
                  {filterCount}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80 max-h-[70vh] overflow-y-auto">
            <div className="space-y-4">
              {/* Activity */}
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Activity
                </Label>
                <select
                  value={config.activityType ?? ""}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      activityType: (e.target.value || undefined) as
                        | ActivityType
                        | undefined,
                    }))
                  }
                  className="flex h-9 w-full rounded-[12px] border border-input bg-white px-3 py-1 text-sm shadow-xs"
                >
                  <option value="">Any activity type</option>
                  {(Object.keys(ACTIVITY_TYPE_LABELS) as ActivityType[]).map(
                    (t) => (
                      <option key={t} value={t}>
                        {ACTIVITY_TYPE_LABELS[t]}
                      </option>
                    ),
                  )}
                </select>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs text-muted-foreground">
                      Active in last (days)
                    </Label>
                    <Input
                      type="number"
                      min={0}
                      placeholder="e.g. 30"
                      value={config.activitySinceDays ?? ""}
                      onChange={(e) =>
                        setConfig((c) => ({
                          ...c,
                          activitySinceDays: e.target.value
                            ? Number(e.target.value)
                            : undefined,
                        }))
                      }
                      className="h-9"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">
                      Inactive for (days)
                    </Label>
                    <Input
                      type="number"
                      min={0}
                      placeholder="e.g. 90"
                      value={config.noActivitySinceDays ?? ""}
                      onChange={(e) =>
                        setConfig((c) => ({
                          ...c,
                          noActivitySinceDays: e.target.value
                            ? Number(e.target.value)
                            : undefined,
                        }))
                      }
                      className="h-9"
                    />
                  </div>
                </div>
              </div>

              {/* Booking status */}
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Has booking with status
                </Label>
                <select
                  value={config.bookingStatus ?? ""}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      bookingStatus: (e.target.value || undefined) as
                        | BookingStatus
                        | undefined,
                    }))
                  }
                  className="flex h-9 w-full rounded-[12px] border border-input bg-white px-3 py-1 text-sm shadow-xs"
                >
                  <option value="">Any</option>
                  {(Object.keys(BOOKING_STATUS_LABELS) as BookingStatus[]).map(
                    (s) => (
                      <option key={s} value={s}>
                        {BOOKING_STATUS_LABELS[s]}
                      </option>
                    ),
                  )}
                </select>
              </div>

              {/* Tags filter */}
              {tags.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                      Tags
                    </Label>
                    <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={!!config.matchAllTags}
                        onChange={(e) =>
                          setConfig((c) => ({
                            ...c,
                            matchAllTags: e.target.checked || undefined,
                          }))
                        }
                      />
                      Match all
                    </label>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {tags.map((tag) => {
                      const active = config.tagIds?.includes(tag.id) ?? false;
                      return (
                        <button
                          key={tag.id}
                          type="button"
                          onClick={() => toggleTagFilter(tag.id)}
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border transition-colors",
                            active
                              ? "border-foreground/30"
                              : "border-border hover:bg-accent",
                          )}
                          style={{
                            backgroundColor: active
                              ? `${tag.color ?? "#6366f1"}20`
                              : undefined,
                            color: active ? tag.color ?? undefined : undefined,
                          }}
                        >
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: tag.color ?? "#94a3b8" }}
                          />
                          {tag.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Kanban-only: pivot tags */}
              {viewType === "kanban" && tags.length > 0 && (
                <div className="space-y-2 pt-3 border-t border-border">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                    Kanban columns
                  </Label>
                  <p className="text-[11px] text-muted-foreground">
                    Pick which tags become columns. Default: all tags.
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {tags.map((tag) => {
                      const active =
                        config.pivotTagIds?.includes(tag.id) ?? false;
                      return (
                        <button
                          key={tag.id}
                          type="button"
                          onClick={() => togglePivotTag(tag.id)}
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border transition-colors",
                            active
                              ? "border-foreground/30"
                              : "border-border hover:bg-accent",
                          )}
                          style={{
                            backgroundColor: active
                              ? `${tag.color ?? "#6366f1"}20`
                              : undefined,
                            color: active ? tag.color ?? undefined : undefined,
                          }}
                        >
                          {tag.name}
                        </button>
                      );
                    })}
                  </div>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
                    <input
                      type="checkbox"
                      checked={!!config.showUntagged}
                      onChange={(e) =>
                        setConfig((c) => ({
                          ...c,
                          showUntagged: e.target.checked || undefined,
                        }))
                      }
                    />
                    Show "Untagged" column
                  </label>
                </div>
              )}

              {filterCount > 0 && (
                <div className="pt-2 border-t border-border">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-xs h-8"
                    onClick={() =>
                      setConfig((c) => ({
                        // keep kanban pivot config when clearing data filters
                        pivotTagIds: c.pivotTagIds,
                        showUntagged: c.showUntagged,
                      }))
                    }
                  >
                    Clear filters
                  </Button>
                </div>
              )}
            </div>
          </PopoverContent>
        </Popover>

        <div className="ml-auto flex items-center gap-2">
          {isDirty && activeView && (
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              onClick={handleUpdateActiveView}
              disabled={updateViewMutation.isPending}
            >
              {updateViewMutation.isPending ? (
                <Loader className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              Update view
            </Button>
          )}
          {isDirty && (
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              onClick={() => setSaveViewOpen(true)}
            >
              <Save className="h-3.5 w-3.5" />
              Save as new view
            </Button>
          )}
        </div>
      </div>

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

      {/* Body */}
      {viewType === "list" ? (
        <Card>
          {loadingContacts && renderSkeletonRows()}
          {errorContacts && !loadingContacts && renderErrorState()}
          {!loadingContacts && !errorContacts && renderTable()}
        </Card>
      ) : loadingContacts ? (
        <Card className="p-12">
          <div className="flex justify-center">
            <Loader className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </Card>
      ) : errorContacts ? (
        <Card>{renderErrorState()}</Card>
      ) : contacts.length === 0 ? (
        <Card>{renderEmptyState()}</Card>
      ) : (
        <ContactsKanban
          contacts={contacts}
          allTags={allTagsForKanban}
          pivotTagIds={config.pivotTagIds ?? null}
          showUntagged={!!config.showUntagged}
        />
      )}

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
                {createMutation.isPending && <Loader className="h-4 w-4 animate-spin" />}
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
                {editMutation.isPending && <Loader className="h-4 w-4 animate-spin" />}
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
              {deleteMutation.isPending && <Loader className="h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Save View Dialog ─── */}
      <Dialog open={saveViewOpen} onOpenChange={setSaveViewOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Save view</DialogTitle>
            <DialogDescription>
              Give this view a name. It will save the current filters and{" "}
              {viewType === "kanban" ? "kanban layout" : "list mode"}.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveView}>
            <div className="space-y-2">
              <Label htmlFor="view-name">Name</Label>
              <Input
                id="view-name"
                placeholder="e.g. Hot leads, Stale contacts"
                value={saveViewName}
                onChange={(e) => setSaveViewName(e.target.value)}
                autoFocus
              />
            </div>
            <DialogFooter className="mt-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => setSaveViewOpen(false)}
                disabled={createViewMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  createViewMutation.isPending || !saveViewName.trim()
                }
              >
                {createViewMutation.isPending && (
                  <Loader className="h-4 w-4 animate-spin" />
                )}
                Save view
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ─── Delete View Dialog ─── */}
      <Dialog
        open={!!deleteViewTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteViewTarget(null);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete view</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{" "}
              <span className="font-medium text-foreground">
                {deleteViewTarget?.name}
              </span>
              ? This won't delete any contacts.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteViewTarget(null)}
              disabled={deleteViewMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                deleteViewTarget && deleteViewMutation.mutate(deleteViewTarget.id)
              }
              disabled={deleteViewMutation.isPending}
            >
              {deleteViewMutation.isPending && (
                <Loader className="h-4 w-4 animate-spin" />
              )}
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
                  {deleteTagMutation.isPending ? <Loader className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                  Delete
                </Button>
              </div>
            ))}
          </div>

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
                  <Loader className="h-4 w-4 animate-spin" />
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
