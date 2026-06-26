import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Plus,
  Users,
  Search,
  Trash2,
  Tags,
  Loader,
  Sparkles,
  AlertCircle,
  X,
  Filter,
  ListIcon,
  LayoutGrid,
  Bookmark,
  Save,
  ChevronDown,
  Check,
  Upload,
  FileText,
  ArrowRight,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { queryClient } from "@/lib/query-client";
import { cn } from "@/lib/utils";
import ContactsKanban from "./ContactsKanban";
import ContactsTable from "./ContactsTable";
import { UNTAGGED_COLUMN_ID, resolveColumnTagIds } from "@/lib/contacts-view";

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
  lastActivityAt?: string | null;
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

type CsvContactField = "name" | "email" | "phone" | "notes";
type CsvContactMapping = Record<CsvContactField, string>;

interface CsvParseResult {
  headers: string[];
  rows: Record<string, string>[];
}

interface ContactImportError {
  row: number;
  reason: string;
}

interface ContactImportResult {
  total: number;
  imported: number;
  skipped: number;
  failed: number;
  remainingCapacity: number | null;
  errors: ContactImportError[];
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
const UNMAPPED_CSV_COLUMN = "__linkycal_unmapped__";
const EMPTY_CSV_MAPPING: CsvContactMapping = {
  name: UNMAPPED_CSV_COLUMN,
  email: UNMAPPED_CSV_COLUMN,
  phone: UNMAPPED_CSV_COLUMN,
  notes: UNMAPPED_CSV_COLUMN,
};
const CSV_CONTACT_FIELDS: Array<{
  field: CsvContactField;
  label: string;
  description: string;
}> = [
  {
    field: "name",
    label: "Name",
    description: "Required unless email is mapped",
  },
  {
    field: "email",
    label: "Email",
    description: "Used to skip duplicate contacts",
  },
  {
    field: "phone",
    label: "Phone",
    description: "Optional phone number",
  },
  {
    field: "notes",
    label: "Notes",
    description: "Optional internal notes",
  },
];

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

function pushCsvCell(row: string[], value: string) {
  row.push(value);
}

function pushCsvRow(rows: string[][], row: string[], value: string) {
  pushCsvCell(row, value);
  rows.push(row);
}

function makeUniqueCsvHeaders(headerRow: string[]): string[] {
  const counts = new Map<string, number>();
  return headerRow.map((header, index) => {
    const base = header.trim() || `Column ${index + 1}`;
    const count = counts.get(base) ?? 0;
    counts.set(base, count + 1);
    return count === 0 ? base : `${base} (${count + 1})`;
  });
}

function parseCsv(text: string): CsvParseResult {
  const source = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let inQuotes = false;

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];

    if (inQuotes) {
      if (char === '"' && source[i + 1] === '"') {
        value += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        value += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      pushCsvCell(row, value);
      value = "";
    } else if (char === "\n") {
      pushCsvRow(rows, row, value);
      row = [];
      value = "";
    } else if (char === "\r") {
      pushCsvRow(rows, row, value);
      row = [];
      value = "";
      if (source[i + 1] === "\n") i += 1;
    } else {
      value += char;
    }
  }

  if (inQuotes) {
    throw new Error("CSV has an unclosed quoted value.");
  }

  if (value.length > 0 || row.length > 0) {
    pushCsvRow(rows, row, value);
  }

  const nonEmptyRows = rows.filter((cells) =>
    cells.some((cell) => cell.trim().length > 0),
  );
  if (nonEmptyRows.length < 2) {
    throw new Error("CSV must include a header row and at least one contact row.");
  }

  const headers = makeUniqueCsvHeaders(nonEmptyRows[0]);
  const dataRows = nonEmptyRows.slice(1).map((cells) => {
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      record[header] = (cells[index] ?? "").trim();
    });
    return record;
  }).filter((record) =>
    Object.values(record).some((cell) => cell.trim().length > 0),
  );

  if (dataRows.length === 0) {
    throw new Error("CSV does not contain any contact rows.");
  }

  return { headers, rows: dataRows };
}

function normalizeCsvHeaderForGuess(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function guessCsvColumn(
  headers: string[],
  candidates: string[],
): string | undefined {
  const normalized = headers.map((header) => ({
    header,
    normalized: normalizeCsvHeaderForGuess(header),
  }));

  const exact = normalized.find((item) => candidates.includes(item.normalized));
  if (exact) return exact.header;

  const partial = normalized.find((item) =>
    candidates.some((candidate) => item.normalized.includes(candidate)),
  );
  return partial?.header;
}

function guessCsvContactMapping(headers: string[]): CsvContactMapping {
  return {
    name: guessCsvColumn(headers, [
      "name",
      "full name",
      "contact name",
      "first name",
    ]) ?? UNMAPPED_CSV_COLUMN,
    email: guessCsvColumn(headers, [
      "email",
      "email address",
      "e mail",
    ]) ?? UNMAPPED_CSV_COLUMN,
    phone: guessCsvColumn(headers, [
      "phone",
      "phone number",
      "mobile",
      "mobile phone",
      "telephone",
    ]) ?? UNMAPPED_CSV_COLUMN,
    notes: guessCsvColumn(headers, [
      "notes",
      "note",
      "description",
      "comments",
    ]) ?? UNMAPPED_CSV_COLUMN,
  };
}

function getCsvMappedValue(
  row: Record<string, string>,
  mapping: CsvContactMapping,
  field: CsvContactField,
): string {
  const column = mapping[field];
  if (column === UNMAPPED_CSV_COLUMN) return "";
  return row[column] ?? "";
}

function getImportMappingPayload(mapping: CsvContactMapping) {
  const payload: Partial<Record<CsvContactField, string>> = {};
  for (const field of CSV_CONTACT_FIELDS.map((item) => item.field)) {
    const column = mapping[field];
    if (column !== UNMAPPED_CSV_COLUMN) {
      payload[field] = column;
    }
  }
  return payload;
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

  // ─── Import dialog ───
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [csvFileName, setCsvFileName] = useState("");
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);
  const [csvMapping, setCsvMapping] = useState<CsvContactMapping>(EMPTY_CSV_MAPPING);
  const [csvError, setCsvError] = useState("");
  const [importResult, setImportResult] = useState<ContactImportResult | null>(null);

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

  const canImportCsv = useMemo(
    () =>
      csvRows.length > 0 &&
      (csvMapping.name !== UNMAPPED_CSV_COLUMN ||
        csvMapping.email !== UNMAPPED_CSV_COLUMN),
    [csvRows.length, csvMapping],
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

  const importContactsMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/contacts/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mapping: getImportMappingPayload(csvMapping),
          rows: csvRows,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to import contacts");
      }
      return (await res.json()) as ContactImportResult;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["projects", projectId, "contacts"] });
      setImportResult(data);
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
    // Optimistically drop the contact from every cached contacts list so the row
    // disappears instantly. The full-list refetch over (remote) D1 can take 10s+,
    // which made deletions look like they did nothing until the refetch landed.
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({
        queryKey: ["projects", projectId, "contacts"],
      });
      const previous = queryClient.getQueriesData<Contact[]>({
        queryKey: ["projects", projectId, "contacts"],
      });
      queryClient.setQueriesData<Contact[]>(
        { queryKey: ["projects", projectId, "contacts"] },
        (old) => (Array.isArray(old) ? old.filter((c) => c.id !== id) : old),
      );
      return { previous };
    },
    onError: (_err, _id, context) => {
      // Restore the snapshots if the delete fails.
      context?.previous?.forEach(([key, data]) =>
        queryClient.setQueryData(key, data),
      );
    },
    onSuccess: () => {
      setDeleteDialogOpen(false);
      setDeletingContact(null);
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: ["projects", projectId, "contacts"],
      });
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

  const updateTagMutation = useMutation({
    mutationFn: async (vars: { id: string; name?: string; color?: string }) => {
      const res = await fetch(`/api/projects/${projectId}/tags/${vars.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: vars.name, color: vars.color }),
      });
      if (!res.ok) throw new Error("Failed to update tag");
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

  const seedPipelineMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/pipeline/seed`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to start pipeline");
      const data = (await res.json()) as { view: SavedView };
      return data.view;
    },
    onSuccess: (view) => {
      queryClient.invalidateQueries({ queryKey: ["projects", projectId, "contact-views"] });
      queryClient.invalidateQueries({ queryKey: ["projects", projectId, "tags"] });
      // Load the new pipeline view immediately, and remember it across reloads.
      try {
        localStorage.setItem(`linkycal:contacts:lastView:${projectId}`, view.id);
      } catch {
        /* ignore */
      }
      setActiveViewId(view.id);
      setConfig(view.config ?? {});
      setSearchInput("");
      setViewType("kanban");
    },
  });

  const stageMutation = useMutation({
    mutationFn: async (vars: {
      contactId: string;
      tagId: string | null;
      groupTagIds: string[];
      optimisticTag: { id: string; name: string; color: string | null } | null;
    }) => {
      const res = await fetch(
        `/api/projects/${projectId}/contacts/${vars.contactId}/stage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tagId: vars.tagId, groupTagIds: vars.groupTagIds }),
        },
      );
      if (!res.ok) throw new Error("Failed to move stage");
      return res.json();
    },
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: ["projects", projectId, "contacts"] });
      const previous = queryClient.getQueriesData<Contact[]>({
        queryKey: ["projects", projectId, "contacts"],
      });
      const groupSet = new Set(vars.groupTagIds);
      queryClient.setQueriesData<Contact[]>(
        { queryKey: ["projects", projectId, "contacts"] },
        (old) =>
          Array.isArray(old)
            ? old.map((ct) => {
                if (ct.id !== vars.contactId) return ct;
                const kept = ct.tags.filter((t) => !groupSet.has(t.id));
                return {
                  ...ct,
                  tags: vars.optimisticTag ? [...kept, vars.optimisticTag] : kept,
                };
              })
            : old,
      );
      return { previous };
    },
    onError: (_e, _vars, context) => {
      context?.previous?.forEach(([key, data]) => queryClient.setQueryData(key, data));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["projects", projectId, "contacts"] });
    },
  });

  // ─── Handlers ───

  const applyView = useCallback(
    (view: SavedView | null) => {
      // Remember the last-selected view so it survives reloads/navigation.
      try {
        const key = `linkycal:contacts:lastView:${projectId}`;
        if (view) localStorage.setItem(key, view.id);
        else localStorage.removeItem(key);
      } catch {
        /* localStorage unavailable — non-fatal */
      }
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
    },
    [projectId],
  );

  // Restore the last-selected view once saved views have loaded.
  const restoredViewRef = useRef(false);
  useEffect(() => {
    if (restoredViewRef.current || savedViews.length === 0) return;
    restoredViewRef.current = true;
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(`linkycal:contacts:lastView:${projectId}`);
    } catch {
      /* ignore */
    }
    if (!stored) return;
    const view = savedViews.find((v) => v.id === stored);
    if (view) applyView(view);
  }, [savedViews, projectId, applyView]);

  const openDeleteDialog = useCallback((contact: Contact) => {
    setDeletingContact(contact);
    setDeleteDialogOpen(true);
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

  function resetContactImportState() {
    setCsvFileName("");
    setCsvHeaders([]);
    setCsvRows([]);
    setCsvMapping(EMPTY_CSV_MAPPING);
    setCsvError("");
    setImportResult(null);
    importContactsMutation.reset();
  }

  async function handleCsvFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setCsvError("");
    setImportResult(null);
    importContactsMutation.reset();

    if (!file) {
      resetContactImportState();
      return;
    }

    try {
      const text = await file.text();
      const parsed = parseCsv(text);
      if (parsed.rows.length > 1000) {
        throw new Error("Import up to 1,000 contacts at a time.");
      }
      setCsvFileName(file.name);
      setCsvHeaders(parsed.headers);
      setCsvRows(parsed.rows);
      setCsvMapping(guessCsvContactMapping(parsed.headers));
    } catch (err) {
      setCsvFileName(file.name);
      setCsvHeaders([]);
      setCsvRows([]);
      setCsvMapping(EMPTY_CSV_MAPPING);
      setCsvError(err instanceof Error ? err.message : "Failed to read CSV.");
    }
  }

  function handleImportContacts() {
    if (!canImportCsv || importContactsMutation.isPending) return;
    importContactsMutation.mutate();
  }

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

  function handleStageChange(contactId: string, toColumnId: string) {
    const groupTagIds =
      config.pivotTagIds && config.pivotTagIds.length > 0
        ? config.pivotTagIds
        : tags.map((t) => t.id);
    const isUntagged = toColumnId === UNTAGGED_COLUMN_ID;
    const tagId = isUntagged ? null : toColumnId;
    const tag = tagId ? tags.find((t) => t.id === tagId) : null;
    stageMutation.mutate({
      contactId,
      tagId,
      groupTagIds,
      optimisticTag: tag ? { id: tag.id, name: tag.name, color: tag.color } : null,
    });
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

  // ─── Kanban step editing ───
  // Board-composition ops edit the live config draft (persisted via "Update view").
  // Materialize the implicit "all tags" order into pivotTagIds on first structural edit.
  function handleAddStep(input: { name?: string; color?: string; tagId?: string }) {
    const base = resolveColumnTagIds(config.pivotTagIds ?? null, tags);
    if (input.tagId) {
      if (base.includes(input.tagId)) return;
      const next = [...base, input.tagId];
      setConfig((c) => ({ ...c, pivotTagIds: next }));
      return;
    }
    const name = input.name?.trim();
    if (!name) return;
    createTagMutation.mutate(
      { name, color: input.color },
      {
        onSuccess: (data: { tag?: { id: string } }) => {
          const newId = data?.tag?.id;
          if (!newId) return;
          setConfig((c) => ({
            ...c,
            pivotTagIds: [...resolveColumnTagIds(c.pivotTagIds ?? null, tags), newId],
          }));
        },
      },
    );
  }

  function handleRemoveStepFromBoard(tagId: string) {
    const base = resolveColumnTagIds(config.pivotTagIds ?? null, tags);
    setConfig((c) => ({ ...c, pivotTagIds: base.filter((id) => id !== tagId) }));
  }

  function handleDeleteStepTag(tagId: string) {
    const base = resolveColumnTagIds(config.pivotTagIds ?? null, tags);
    setConfig((c) => ({ ...c, pivotTagIds: base.filter((id) => id !== tagId) }));
    deleteTagMutation.mutate(tagId);
  }

  function handleRenameStep(tagId: string, name: string) {
    const n = name.trim();
    if (!n) return;
    updateTagMutation.mutate({ id: tagId, name: n });
  }

  function handleRecolorStep(tagId: string, color: string) {
    updateTagMutation.mutate({ id: tagId, color });
  }

  function handleSwapStep(tagId: string, newTagId: string) {
    const base = resolveColumnTagIds(config.pivotTagIds ?? null, tags);
    const idx = base.indexOf(tagId);
    if (idx === -1) return;
    if (base.includes(newTagId)) {
      setConfig((c) => ({ ...c, pivotTagIds: base.filter((id) => id !== tagId) }));
      return;
    }
    const next = [...base];
    next[idx] = newTagId;
    setConfig((c) => ({ ...c, pivotTagIds: next }));
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

  function renderImportMapper() {
    if (csvRows.length === 0) return null;

    const previewRows = csvRows.slice(0, 5);

    return (
      <div className="space-y-4">
        <div className="rounded-[16px] bg-muted/50 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-white text-muted-foreground">
              <FileText className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{csvFileName}</p>
              <p className="text-xs text-muted-foreground">
                {csvRows.length} row{csvRows.length !== 1 ? "s" : ""} found
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-3">
          {CSV_CONTACT_FIELDS.map((item) => (
            <div
              key={item.field}
              className="grid gap-3 rounded-[16px] bg-muted/50 px-4 py-3 sm:grid-cols-[1fr_auto_1.3fr] sm:items-center"
            >
              <div>
                <p className="text-sm font-medium">{item.label}</p>
                <p className="text-xs text-muted-foreground">{item.description}</p>
              </div>
              <ArrowRight className="hidden h-4 w-4 text-muted-foreground sm:block" />
              <Select
                value={csvMapping[item.field]}
                onValueChange={(value) =>
                  setCsvMapping((mapping) => ({
                    ...mapping,
                    [item.field]: value,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose a CSV column" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNMAPPED_CSV_COLUMN}>Do not import</SelectItem>
                  {csvHeaders.map((header) => (
                    <SelectItem key={header} value={header}>
                      {header}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>

        {!canImportCsv && (
          <div className="flex items-start gap-3 rounded-[16px] bg-amber-500/10 px-4 py-3 text-sm text-amber-900">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>Map at least a name or email column before importing.</p>
          </div>
        )}

        <div className="space-y-2">
          <p className="text-sm font-medium">Preview</p>
          <div className="space-y-2">
            {previewRows.map((row, index) => {
              const email = getCsvMappedValue(row, csvMapping, "email");
              const name =
                getCsvMappedValue(row, csvMapping, "name") ||
                (email ? email.split("@")[0] : "Unnamed contact");
              const phone = getCsvMappedValue(row, csvMapping, "phone");
              const notes = getCsvMappedValue(row, csvMapping, "notes");

              return (
                <div
                  key={index}
                  className="flex items-center gap-3 rounded-[16px] bg-muted/50 px-4 py-3"
                >
                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
                    style={{ backgroundColor: getAvatarColor(name) }}
                  >
                    {getInitial(name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[email, phone, notes].filter(Boolean).join(" · ") ||
                        "No optional fields mapped"}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  function renderImportResult() {
    if (!importResult) return null;

    return (
      <div className="space-y-3 rounded-[16px] bg-muted/50 px-4 py-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Check className="h-3.5 w-3.5" />
          </div>
          <div>
            <p className="text-sm font-medium">Import complete</p>
            <p className="text-xs text-muted-foreground">
              {importResult.imported} imported, {importResult.skipped} skipped,{" "}
              {importResult.failed} failed from {importResult.total} rows.
            </p>
          </div>
        </div>

        {importResult.errors.length > 0 && (
          <div className="space-y-1">
            {importResult.errors.slice(0, 5).map((error) => (
              <p key={`${error.row}-${error.reason}`} className="text-xs text-muted-foreground">
                Row {error.row}: {error.reason}
              </p>
            ))}
            {importResult.errors.length > 5 && (
              <p className="text-xs text-muted-foreground">
                {importResult.errors.length - 5} more issue
                {importResult.errors.length - 5 !== 1 ? "s" : ""} not shown.
              </p>
            )}
          </div>
        )}
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
        <Button variant="outline" onClick={() => setImportDialogOpen(true)}>
          <Upload className="h-4 w-4" />
          Import CSV
        </Button>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="h-4 w-4" />
          Add Contact
        </Button>
      </PageHeader>

      {/* Toolbar: search + filters left, view controls right */}
      <div className="flex items-center flex-wrap gap-2 mb-4">
        {/* Search */}
        <div className="relative flex-1 min-w-[240px] max-w-xl">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search contacts by name, email, or phone..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9 h-9"
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
                <Select
                  value={config.activityType ?? "any"}
                  onValueChange={(v) =>
                    setConfig((c) => ({
                      ...c,
                      activityType:
                        v === "any" ? undefined : (v as ActivityType),
                    }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Any activity type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any activity type</SelectItem>
                    {(Object.keys(ACTIVITY_TYPE_LABELS) as ActivityType[]).map(
                      (t) => (
                        <SelectItem key={t} value={t}>
                          {ACTIVITY_TYPE_LABELS[t]}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>

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
                <Select
                  value={config.bookingStatus ?? "any"}
                  onValueChange={(v) =>
                    setConfig((c) => ({
                      ...c,
                      bookingStatus:
                        v === "any" ? undefined : (v as BookingStatus),
                    }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Any" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any</SelectItem>
                    {(Object.keys(BOOKING_STATUS_LABELS) as BookingStatus[]).map(
                      (s) => (
                        <SelectItem key={s} value={s}>
                          {BOOKING_STATUS_LABELS[s]}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* Tags filter */}
              {tags.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                    Tags
                  </Label>
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
            <PopoverContent align="end" className="w-72 p-2">
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
                {/* Always-reachable starter pipeline — hidden once one exists */}
                {!savedViews.some(
                  (v) =>
                    v.type === "kanban" &&
                    (v.config?.pivotTagIds?.length ?? 0) > 0,
                ) && (
                  <>
                    <div className="my-1 h-px bg-border" />
                    <button
                      type="button"
                      onClick={() => {
                        seedPipelineMutation.mutate();
                        setViewsMenuOpen(false);
                      }}
                      disabled={seedPipelineMutation.isPending}
                      className="flex w-full items-center gap-2 rounded-[10px] px-2.5 py-2 text-sm hover:bg-accent text-left disabled:opacity-60"
                    >
                      {seedPipelineMutation.isPending ? (
                        <Loader className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                      ) : (
                        <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                      Start a sales pipeline
                    </button>
                  </>
                )}
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
                Table
              </TabsTrigger>
              <TabsTrigger value="kanban" className="h-7 px-2.5">
                <LayoutGrid className="h-3.5 w-3.5" />
                Kanban
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Body */}
      {viewType === "list" ? (
        <Card>
          {loadingContacts && renderSkeletonRows()}
          {errorContacts && !loadingContacts && renderErrorState()}
          {!loadingContacts && !errorContacts && contacts.length === 0 && renderEmptyState()}
          {!loadingContacts && !errorContacts && contacts.length > 0 && (
            <ContactsTable
              contacts={contacts}
              allTags={allTagsForKanban}
              pivotTagIds={config.pivotTagIds ?? null}
              onSelect={(id) => navigateToContact(id)}
              onEdit={(id) => {
                const c = contacts.find((x) => x.id === id);
                if (c) openEditDialog(c);
              }}
              onDelete={(id) => {
                const c = contacts.find((x) => x.id === id);
                if (c) openDeleteDialog(c);
              }}
            />
          )}
        </Card>
      ) : loadingContacts ? (
        <Card className="p-12">
          <div className="flex justify-center">
            <Loader className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </Card>
      ) : errorContacts ? (
        <Card>{renderErrorState()}</Card>
      ) : (
        <ContactsKanban
          contacts={contacts}
          allTags={allTagsForKanban}
          pivotTagIds={config.pivotTagIds ?? null}
          showUntagged={!!config.showUntagged}
          onStageChange={handleStageChange}
          onStartPipeline={() => seedPipelineMutation.mutate()}
          seedingPipeline={seedPipelineMutation.isPending}
          editable
          onAddStep={handleAddStep}
          onRenameStep={handleRenameStep}
          onRecolorStep={handleRecolorStep}
          onSwapStep={handleSwapStep}
          onRemoveStepFromBoard={handleRemoveStepFromBoard}
          onDeleteStepTag={handleDeleteStepTag}
        />
      )}

      {/* ─── Import Contacts Dialog ─── */}
      <Dialog
        open={importDialogOpen}
        onOpenChange={(open) => {
          setImportDialogOpen(open);
          if (!open) resetContactImportState();
        }}
      >
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Import CSV</DialogTitle>
            <DialogDescription>
              Upload a CSV, map its columns, and import contacts into this project.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="contact-csv-file">CSV file</Label>
              <Input
                id="contact-csv-file"
                type="file"
                accept=".csv,text/csv"
                onChange={handleCsvFileChange}
              />
            </div>

            {csvError && (
              <div className="flex items-start gap-3 rounded-[16px] bg-destructive/10 px-4 py-3 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{csvError}</p>
              </div>
            )}

            {renderImportMapper()}
            {renderImportResult()}
            {importContactsMutation.isError && (
              <div className="flex items-start gap-3 rounded-[16px] bg-destructive/10 px-4 py-3 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  {importContactsMutation.error instanceof Error
                    ? importContactsMutation.error.message
                    : "Failed to import contacts"}
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setImportDialogOpen(false)}
              disabled={importContactsMutation.isPending}
            >
              <X className="h-4 w-4" />
              Close
            </Button>
            <Button
              type="button"
              onClick={handleImportContacts}
              disabled={
                !canImportCsv ||
                importContactsMutation.isPending ||
                !!importResult
              }
            >
              {importContactsMutation.isPending ? (
                <Loader className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              Import Contacts
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

          <form onSubmit={handleCreateTag} className="mt-4 pt-4 space-y-2">
            <p className="text-sm font-medium">Create new tag</p>
            <div className="flex items-center gap-2">
              <label
                className="h-10 w-10 shrink-0 cursor-pointer rounded-[12px] border transition-transform hover:scale-105"
                style={{ backgroundColor: newTagColor }}
                title="Pick a color"
              >
                <input
                  type="color"
                  value={
                    /^#[0-9a-fA-F]{6}$/.test(newTagColor)
                      ? newTagColor
                      : "#6366f1"
                  }
                  onChange={(e) => setNewTagColor(e.target.value)}
                  className="h-0 w-0 opacity-0"
                  aria-label="Tag color"
                />
              </label>
              <Input
                id="tag-name"
                placeholder="e.g. VIP, Lead, Customer"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                className="flex-1"
              />
              <Button
                type="submit"
                size="sm"
                className="h-10 w-10 shrink-0 p-0"
                aria-label="Add tag"
                disabled={createTagMutation.isPending || !newTagName.trim()}
              >
                {createTagMutation.isPending ? (
                  <Loader className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
