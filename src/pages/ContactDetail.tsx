import { useState, useEffect, useMemo, useRef } from "react";
import type { CSSProperties } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  ArrowLeft,
  Mail,
  Phone,
  StickyNote,
  CalendarCheck,
  X as XIcon,
  FileText,
  Tag,
  Plus,
  Check,
  Loader,
  AlertCircle,
  Clock,
  Building2,
  Briefcase,
  Globe,
  Users,
  DollarSign,
  Link2,
  Sparkles,
  CalendarClock,
  Pencil,
  Save,
  CheckCircle2,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { TagPickerContent } from "@/components/TagPicker";
import { useMinuteNow } from "@/hooks/use-minute-now";
import {
  datetimeLocalToIso,
  formatNextActionDeadline,
  formatNextActionRelative,
  toDatetimeLocalValue,
} from "@/lib/contact-time";
import { queryClient } from "@/lib/query-client";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ContactTag {
  id: string;
  name: string;
  color: string | null;
}

interface ContactActivity {
  id: string;
  contactId: string;
  type:
    | "contact_created"
    | "form_submitted"
    | "booked"
    | "cancelled"
    | "tag_added"
    | "tag_removed"
    | "workflow_researched"
    | "next_action_set"
    | "next_action_completed";
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
  company: string | null;
  companyWebsite: string | null;
  position: string | null;
  companySize: string | null;
  estimatedRevenue: string | null;
  linkedinUrl: string | null;
  nextActionText: string | null;
  nextActionDeadline: string | null;
  createdAt: string;
  updatedAt: string;
  tags: ContactTag[];
  activity: ContactActivity[];
}

type NextActionMutationInput =
  | { text: string; deadline: string }
  | { text: null; deadline: null };

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
    case "next_action_set":
      return <CalendarClock className="h-4 w-4 text-blue-600" />;
    case "next_action_completed":
      return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
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
    case "workflow_researched":
      return `Stored ${meta?.provider ?? "AI"} research in '${meta?.resultKey ?? "research"}'`;
    case "next_action_set":
      return `Next action set to '${meta?.text ?? "unknown"}'`;
    case "next_action_completed":
      return `Completed next action '${meta?.text ?? "unknown"}'`;
    default:
      return "Activity recorded";
  }
}

function ensureHttps(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  return `https://${url}`;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ContactDetailPage() {
  const { projectId, contactId } = useParams<{ projectId: string; contactId: string }>();
  const navigate = useNavigate();

  const [addTagOpen, setAddTagOpen] = useState(false);
  const [editingNextAction, setEditingNextAction] = useState(false);
  const [nextActionText, setNextActionText] = useState("");
  const [nextActionDeadline, setNextActionDeadline] = useState("");
  const [nextActionError, setNextActionError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"saving" | "saved" | "error" | null>(null);
  const saveStatusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const now = useMinuteNow();

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

  const contact = contactData;

  // Quick stats from activity
  const stats = useMemo(() => {
    if (!contact) return { bookings: 0, formSubmissions: 0 };
    return {
      bookings: contact.activity.filter((a) => a.type === "booked").length,
      formSubmissions: contact.activity.filter((a) => a.type === "form_submitted").length,
    };
  }, [contact]);

  // ─── Mutations ───

  const updateMutation = useMutation({
    mutationFn: async (
      data: Partial<{
        name: string;
        email: string | null;
        phone: string | null;
        notes: string | null;
        company: string | null;
        companyWebsite: string | null;
        position: string | null;
        companySize: string | null;
        estimatedRevenue: string | null;
        linkedinUrl: string | null;
      }>,
    ) => {
      const res = await fetch(`/api/projects/${projectId}/contacts/${contactId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update contact");
      return res.json();
    },
    onMutate: () => {
      if (saveStatusTimer.current) clearTimeout(saveStatusTimer.current);
      setSaveStatus("saving");
    },
    onSuccess: () => {
      setSaveStatus("saved");
      saveStatusTimer.current = setTimeout(() => setSaveStatus(null), 2000);
      queryClient.invalidateQueries({ queryKey: ["projects", projectId, "contacts", contactId] });
      queryClient.invalidateQueries({ queryKey: ["projects", projectId, "contacts"] });
    },
    onError: () => {
      setSaveStatus("error");
      // Refetch to revert the field to its saved value
      queryClient.invalidateQueries({ queryKey: ["projects", projectId, "contacts", contactId] });
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

  const nextActionMutation = useMutation({
    mutationFn: async (input: NextActionMutationInput) => {
      const res = await fetch(
        `/api/projects/${projectId}/contacts/${contactId}/next-action`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          (data as { error?: string }).error ??
            "Failed to update next action",
        );
      }
      return res.json() as Promise<{ contact: ContactDetail }>;
    },
    onSuccess: (data) => {
      queryClient.setQueryData<ContactDetail>(
        ["projects", projectId, "contacts", contactId],
        (current) =>
          current ? { ...current, ...data.contact } : data.contact,
      );
      queryClient.invalidateQueries({
        queryKey: ["projects", projectId, "contacts", contactId],
      });
      queryClient.invalidateQueries({
        queryKey: ["projects", projectId, "contacts"],
      });
      setEditingNextAction(false);
      setNextActionError(null);
    },
    onError: () => {
      setNextActionError("Failed to update next action.");
    },
  });

  // ─── Enrichment ───

  const [enrichError, setEnrichError] = useState<string | null>(null);

  const { data: enrichUsage } = useQuery<{ used: number; limit: number; remaining: number; unlimited: boolean }>({
    queryKey: ["projects", projectId, "enrichment-usage"],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/enrichment-usage`);
      if (!res.ok) throw new Error("Failed to load usage");
      return res.json();
    },
    enabled: !!projectId,
  });

  const enrichMutation = useMutation({
    // Enrichment runs synchronously server-side (web research + write), so this
    // request stays open for the whole job and resolves once the contact's
    // fields are updated. isPending drives the button's loading state.
    mutationFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/contacts/${contactId}/enrich`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "Failed to enrich contact");
      }
      return res.json();
    },
    onSuccess: () => {
      setEnrichError(null);
      // The enriched fields + new activity are already persisted; refetch to show them.
      queryClient.invalidateQueries({ queryKey: ["projects", projectId, "contacts", contactId] });
      queryClient.invalidateQueries({ queryKey: ["projects", projectId, "contacts"] });
      queryClient.invalidateQueries({ queryKey: ["projects", projectId, "enrichment-usage"] });
    },
    onError: (err: Error) => {
      const msg = err.message.includes("Monthly enrichment limit")
        ? "Monthly enrichment limit reached."
        : (err.message || "Failed to enrich contact.");
      setEnrichError(msg);
    },
  });

  // ─── Handlers ───

  function goBack() {
    navigate(`/app/projects/${projectId}/contacts`);
  }

  function startNextActionEditor() {
    setNextActionText(contact?.nextActionText ?? "");
    setNextActionDeadline(
      contact?.nextActionDeadline
        ? toDatetimeLocalValue(contact.nextActionDeadline)
        : "",
    );
    setNextActionError(null);
    setEditingNextAction(true);
  }

  function cancelNextActionEditor() {
    setEditingNextAction(false);
    setNextActionError(null);
  }

  function saveNextAction() {
    const deadline = datetimeLocalToIso(nextActionDeadline);
    const text = nextActionText.trim();
    if (!text || !deadline) return;
    nextActionMutation.mutate({ text, deadline });
  }

  function completeNextAction() {
    setNextActionError(null);
    nextActionMutation.mutate({ text: null, deadline: null });
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
              <CardContent className="space-y-4">
                <div className="flex items-start gap-4">
                  <Skeleton className="h-14 w-14 rounded-full shrink-0" />
                  <div className="flex-1 space-y-3">
                    <Skeleton className="h-6 w-40" />
                    <div className="flex gap-2">
                      <Skeleton className="h-6 w-20 rounded-full" />
                      <Skeleton className="h-6 w-24 rounded-full" />
                    </div>
                  </div>
                </div>
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
  const hasNextAction = Boolean(
    contact.nextActionText && contact.nextActionDeadline,
  );
  const nextActionDeadlineLabel = contact.nextActionDeadline
    ? formatNextActionDeadline(contact.nextActionDeadline)
    : null;
  const nextActionRelative = contact.nextActionDeadline
    ? formatNextActionRelative(contact.nextActionDeadline, now)
    : null;
  const nextActionIsOverdue = nextActionRelative?.startsWith("Overdue") ?? false;
  const nextActionDeadlineIso = datetimeLocalToIso(nextActionDeadline);
  const canSaveNextAction = Boolean(
    nextActionText.trim() && nextActionDeadlineIso,
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
        <Button
          onClick={() => enrichMutation.mutate()}
          disabled={
            enrichMutation.isPending ||
            (!!enrichUsage && !enrichUsage.unlimited && enrichUsage.remaining <= 0)
          }
          title={
            enrichUsage && !enrichUsage.unlimited && enrichUsage.remaining <= 0
              ? "Monthly enrichment limit reached — upgrade for more"
              : undefined
          }
        >
          {enrichMutation.isPending ? (
            <><Loader className="h-4 w-4 animate-spin" /> Enriching…</>
          ) : (
            <><Sparkles className="h-4 w-4" /> Enrich
              {enrichUsage && !enrichUsage.unlimited ? ` (${enrichUsage.remaining} left)` : ""}
            </>
          )}
        </Button>
      </PageHeader>

      {enrichError && (
        <div className="flex items-center gap-2 rounded-[12px] border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive mb-4">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {enrichError}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
        {/* ─── Main Column ─── */}
        <div className="space-y-6">
          {/* Contact Info Card */}
          <Card>
            <CardContent className="space-y-5 pt-2">
              {/* Avatar & Name (click name to edit) */}
              <div data-contact-identity="true" className="flex items-start gap-4">
                <div
                  className="h-14 w-14 rounded-full flex items-center justify-center text-white text-xl font-semibold shrink-0"
                  style={{ backgroundColor: getAvatarColor(contact.name) }}
                >
                  {getInitial(contact.name)}
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex min-w-0 items-center justify-between gap-3">
                    <InlineField
                      key={`name-${contact.id}`}
                      value={contact.name}
                      placeholder="Contact name"
                      required
                      className="text-lg font-semibold text-foreground"
                      onSave={(v) => updateMutation.mutate({ name: v ?? "" })}
                    />
                    {saveStatus && (
                      <span
                        className={cn(
                          "flex shrink-0 items-center gap-1 text-[11px] font-normal",
                          saveStatus === "saving" && "text-muted-foreground",
                          saveStatus === "saved" && "text-emerald-600",
                          saveStatus === "error" && "text-destructive",
                        )}
                      >
                        {saveStatus === "saving" && (
                          <>
                            <Loader className="h-3 w-3 animate-spin" />
                            Saving...
                          </>
                        )}
                        {saveStatus === "saved" && (
                          <>
                            <Check className="h-3 w-3" />
                            Saved
                          </>
                        )}
                        {saveStatus === "error" && (
                          <>
                            <AlertCircle className="h-3 w-3" />
                            Failed to save
                          </>
                        )}
                      </span>
                    )}
                  </div>

                  <div data-contact-tags="inline" className="flex flex-wrap items-center gap-2">
                    {contact.tags.map((tag) => (
                      <button
                        key={tag.id}
                        type="button"
                        className="ring-shadow inline-flex items-center gap-1 rounded-full border-0 py-0.5 pl-2 pr-1 text-[11px] font-medium transition-[background-color,box-shadow,transform] hover:bg-black/5 active:scale-[0.96]"
                        style={{
                          backgroundColor: tag.color ? `${tag.color}15` : undefined,
                          color: tag.color ?? undefined,
                          "--ring-shadow-color": tag.color ?? "#e2e8f0",
                        } as CSSProperties}
                        title={`Remove ${tag.name} tag`}
                        onClick={() => removeTagMutation.mutate(tag.id)}
                        disabled={removeTagMutation.isPending}
                      >
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{ backgroundColor: tag.color ?? "#94a3b8" }}
                        />
                        <span>{tag.name}</span>
                        <XIcon className="h-3 w-3" />
                      </button>
                    ))}

                    <Popover open={addTagOpen} onOpenChange={setAddTagOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 gap-1.5 px-1.5 text-[11px] [&_svg]:size-3.5"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Add Tag
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="start" className="w-64 p-2">
                        <TagPickerContent
                          projectId={projectId!}
                          assignedTagIds={contact.tags.map((tag) => tag.id)}
                          pendingTagId={
                            addTagMutation.isPending
                              ? addTagMutation.variables
                              : removeTagMutation.isPending
                                ? removeTagMutation.variables
                                : null
                          }
                          onToggle={(tag, assigned) =>
                            assigned
                              ? removeTagMutation.mutate(tag.id)
                              : addTagMutation.mutate(tag.id)
                          }
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              </div>

              {/* Details — edit in place, saved on blur */}
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-sm">
                  <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                  <InlineField
                    key={`email-${contact.id}`}
                    value={contact.email}
                    type="email"
                    placeholder="Add email..."
                    onSave={(v) => updateMutation.mutate({ email: v })}
                  />
                </div>

                <div className="flex items-center gap-3 text-sm">
                  <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                  <InlineField
                    key={`phone-${contact.id}`}
                    value={contact.phone}
                    type="tel"
                    placeholder="Add phone..."
                    onSave={(v) => updateMutation.mutate({ phone: v })}
                  />
                </div>

                <div className="flex items-start gap-3 text-sm">
                  <StickyNote className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                  <InlineField
                    key={`notes-${contact.id}`}
                    value={contact.notes}
                    multiline
                    placeholder="Add notes..."
                    onSave={(v) => updateMutation.mutate({ notes: v })}
                  />
                </div>

                <div className="flex items-center gap-3 text-sm">
                  <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                  <InlineField key={`company-${contact.id}`} value={contact.company}
                    placeholder="Add company..." onSave={(v) => updateMutation.mutate({ company: v })} />
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <Briefcase className="h-4 w-4 text-muted-foreground shrink-0" />
                  <InlineField key={`position-${contact.id}`} value={contact.position}
                    placeholder="Add position..." onSave={(v) => updateMutation.mutate({ position: v })} />
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
                  <InlineField key={`website-${contact.id}`} value={contact.companyWebsite}
                    placeholder="Add company website..." onSave={(v) => updateMutation.mutate({ companyWebsite: v })} />
                  {contact.companyWebsite && (
                    <a
                      href={ensureHttps(contact.companyWebsite)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 text-muted-foreground hover:text-primary transition-colors"
                      title="Open website"
                    >
                      <Globe className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                  <InlineField key={`size-${contact.id}`} value={contact.companySize}
                    placeholder="Add company size..." onSave={(v) => updateMutation.mutate({ companySize: v })} />
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <DollarSign className="h-4 w-4 text-muted-foreground shrink-0" />
                  <InlineField key={`revenue-${contact.id}`} value={contact.estimatedRevenue}
                    placeholder="Add estimated revenue..." onSave={(v) => updateMutation.mutate({ estimatedRevenue: v })} />
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <Link2 className="h-4 w-4 text-muted-foreground shrink-0" />
                  <InlineField key={`linkedin-${contact.id}`} value={contact.linkedinUrl}
                    placeholder="Add LinkedIn URL..." onSave={(v) => updateMutation.mutate({ linkedinUrl: v })} />
                  {contact.linkedinUrl && (
                    <a
                      href={ensureHttps(contact.linkedinUrl)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 text-muted-foreground hover:text-primary transition-colors"
                      title="Open LinkedIn"
                    >
                      <Link2 className="h-3.5 w-3.5" />
                    </a>
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
          <Card data-next-action-card="true">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-muted-foreground" />
                Next Action
              </CardTitle>
            </CardHeader>
            <CardContent>
              {editingNextAction ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="next-action-text">Action</Label>
                    <Input
                      id="next-action-text"
                      value={nextActionText}
                      maxLength={500}
                      placeholder="Send revised proposal"
                      onChange={(event) =>
                        setNextActionText(event.target.value)
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="next-action-deadline">Deadline</Label>
                    <Input
                      id="next-action-deadline"
                      type="datetime-local"
                      value={nextActionDeadline}
                      onChange={(event) =>
                        setNextActionDeadline(event.target.value)
                      }
                    />
                  </div>
                  {nextActionError && (
                    <p className="flex items-center gap-1.5 text-xs text-destructive">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                      {nextActionError}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      onClick={saveNextAction}
                      disabled={
                        !canSaveNextAction || nextActionMutation.isPending
                      }
                    >
                      {nextActionMutation.isPending ? (
                        <Loader className="h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4" />
                      )}
                      Save
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={cancelNextActionEditor}
                      disabled={nextActionMutation.isPending}
                    >
                      <XIcon className="h-4 w-4" />
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : hasNextAction ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <p className="break-words text-pretty text-sm font-medium text-foreground">
                      {contact.nextActionText}
                    </p>
                    {nextActionDeadlineLabel && (
                      <p className="flex items-center gap-1.5 text-xs tabular-nums text-muted-foreground">
                        <CalendarClock className="h-3.5 w-3.5 shrink-0" />
                        {nextActionDeadlineLabel}
                      </p>
                    )}
                    {nextActionRelative && (
                      <p
                        className={cn(
                          "text-xs font-medium tabular-nums",
                          nextActionIsOverdue
                            ? "text-destructive"
                            : "text-muted-foreground",
                        )}
                      >
                        {nextActionRelative}
                      </p>
                    )}
                  </div>
                  {nextActionError && (
                    <p className="flex items-center gap-1.5 text-xs text-destructive">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                      {nextActionError}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={startNextActionEditor}
                      disabled={nextActionMutation.isPending}
                    >
                      <Pencil className="h-4 w-4" />
                      Edit
                    </Button>
                    <Button
                      type="button"
                      onClick={completeNextAction}
                      disabled={nextActionMutation.isPending}
                    >
                      {nextActionMutation.isPending ? (
                        <Loader className="h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4" />
                      )}
                      Mark Done
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-pretty text-sm text-muted-foreground">
                    No next action
                  </p>
                  {nextActionError && (
                    <p className="flex items-center gap-1.5 text-xs text-destructive">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                      {nextActionError}
                    </p>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={startNextActionEditor}
                  >
                    <Plus className="h-4 w-4" />
                    Add Next Action
                  </Button>
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
    </div>
  );
}

// ─── Inline Field ────────────────────────────────────────────────────────────
//
// Seamless edit-in-place input: invisible until hover (dashed underline),
// saves on blur. Passing `null` to onSave clears the field.

function InlineField({
  value,
  placeholder,
  type = "text",
  multiline = false,
  required = false,
  className,
  onSave,
}: {
  value: string | null;
  placeholder: string;
  type?: string;
  multiline?: boolean;
  required?: boolean;
  className?: string;
  onSave: (value: string | null) => void;
}) {
  const [local, setLocal] = useState(value ?? "");
  const editingRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    // Don't clobber in-progress typing with background refetches.
    if (!editingRef.current) setLocal(value ?? "");
  }, [value]);

  // Auto-resize the notes textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [local, multiline]);

  function commit() {
    editingRef.current = false;
    const next = local.trim();
    if (required && !next) {
      setLocal(value ?? "");
      return;
    }
    if (next !== (value ?? "")) {
      onSave(next || null);
    } else {
      setLocal(value ?? "");
    }
  }

  const sharedClasses = cn(
    "w-full min-w-0 bg-transparent outline-none border-0 border-b border-dashed border-transparent hover:border-muted-foreground/30 focus:border-solid focus:border-primary transition-colors placeholder:text-muted-foreground",
    className,
  );

  if (multiline) {
    return (
      <textarea
        ref={textareaRef}
        rows={1}
        value={local}
        placeholder={placeholder}
        onChange={(e) => setLocal(e.target.value)}
        onFocus={() => {
          editingRef.current = true;
        }}
        onBlur={commit}
        className={cn(sharedClasses, "resize-none overflow-hidden leading-relaxed")}
      />
    );
  }

  return (
    <input
      type={type}
      value={local}
      placeholder={placeholder}
      onChange={(e) => setLocal(e.target.value)}
      onFocus={() => {
        editingRef.current = true;
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setLocal(value ?? "");
          e.currentTarget.blur();
        }
      }}
      className={sharedClasses}
    />
  );
}
