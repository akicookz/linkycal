import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Inbox,
  AlertCircle,
  Download,
  CheckCircle2,
  Clock,
  XCircle,
  BarChart3,
  FileText,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { ActivityCard } from "@/components/ActivityCard";
import { CopyableField } from "@/components/CopyableField";

// ─── Types ───────────────────────────────────────────────────────────────────

interface FormField {
  id: string;
  stepId: string;
  sortOrder: number;
  type: string;
  label: string;
  placeholder: string | null;
  required: boolean;
  validation: unknown;
  options: Array<{ label: string; value: string }> | null;
  createdAt: string;
}

interface FormStep {
  id: string;
  formId: string;
  sortOrder: number;
  title: string | null;
  description: string | null;
  settings: unknown;
  fields: FormField[];
}

interface FullForm {
  id: string;
  projectId: string;
  name: string;
  slug: string;
  type: "multi_step" | "single";
  status: "draft" | "active" | "archived";
  settings: unknown;
  createdAt: string;
  updatedAt: string;
  steps: FormStep[];
}

interface ResponseValue {
  id: string;
  responseId: string;
  fieldId: string;
  value: string | null;
  fileUrl: string | null;
  fieldLabel: string;
  fieldType: string;
  displayValue: string;
}

interface FormResponse {
  id: string;
  formId: string;
  currentStepIndex: number;
  status: "in_progress" | "completed" | "abandoned";
  respondentEmail: string | null;
  metadata: unknown;
  createdAt: string;
  updatedAt: string;
  values: ResponseValue[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function statusVariant(status: FormResponse["status"]) {
  switch (status) {
    case "completed":
      return "success" as const;
    case "in_progress":
      return "secondary" as const;
    case "abandoned":
      return "warning" as const;
    default:
      return "secondary" as const;
  }
}

function statusLabel(status: FormResponse["status"]) {
  switch (status) {
    case "completed":
      return "Completed";
    case "in_progress":
      return "In Progress";
    case "abandoned":
      return "Abandoned";
    default:
      return status;
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function FormResponses() {
  const { projectId, formId } = useParams<{
    projectId: string;
    formId: string;
  }>();
  const navigate = useNavigate();

  const [drawerItem, setDrawerItem] = useState<FormResponse | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // ─── Queries ─────────────────────────────────────────────────────────────

  const {
    data: formData,
    isLoading: isFormLoading,
    isError: isFormError,
  } = useQuery<FullForm>({
    queryKey: ["projects", projectId, "forms", formId],
    queryFn: async () => {
      const res = await fetch(
        `/api/projects/${projectId}/forms/${formId}`
      );
      if (!res.ok) throw new Error("Failed to fetch form");
      const data = await res.json();
      return data.form ?? data;
    },
    enabled: !!projectId && !!formId,
  });

  const {
    data: responsesData,
    isLoading: isResponsesLoading,
    isError: isResponsesError,
  } = useQuery<FormResponse[]>({
    queryKey: ["projects", projectId, "forms", formId, "responses"],
    queryFn: async () => {
      const res = await fetch(
        `/api/projects/${projectId}/forms/${formId}/responses`
      );
      if (!res.ok) throw new Error("Failed to fetch responses");
      const data = await res.json();
      return data.responses ?? [];
    },
    enabled: !!projectId && !!formId,
  });

  const form = formData;
  const responses = responsesData ?? [];
  const isLoading = isFormLoading || isResponsesLoading;
  const isError = isFormError || isResponsesError;

  // ─── Stats ───────────────────────────────────────────────────────────────

  const totalResponses = responses.length;
  const completedCount = responses.filter(
    (r) => r.status === "completed"
  ).length;
  const inProgressCount = responses.filter(
    (r) => r.status === "in_progress"
  ).length;
  const abandonedCount = responses.filter(
    (r) => r.status === "abandoned"
  ).length;

  // ─── Render: Loading ─────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div>
        <div className="flex items-center gap-3 mb-8">
          <Skeleton className="h-8 w-8" />
          <div>
            <Skeleton className="h-7 w-48 mb-1" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-4 pb-4">
                <Skeleton className="h-4 w-16 mb-2" />
                <Skeleton className="h-8 w-12" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[160px] rounded-[20px]" />
          ))}
        </div>
      </div>
    );
  }

  // ─── Render: Error ───────────────────────────────────────────────────────

  if (isError) {
    return (
      <div>
        <PageHeader title="Form Responses" />
        <div className="flex flex-col items-center justify-center rounded-[20px] border border-dashed py-16">
          <AlertCircle className="h-10 w-10 text-destructive mb-4" />
          <p className="text-sm font-medium text-foreground mb-1">
            Failed to load responses
          </p>
          <p className="text-sm text-muted-foreground">
            Please try refreshing the page.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => navigate(`/app/projects/${projectId}/forms`)}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Forms
          </Button>
        </div>
      </div>
    );
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-8">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 shrink-0"
            onClick={() =>
              navigate(`/app/projects/${projectId}/forms/${formId}`)
            }
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-semibold text-foreground tracking-tight">
              {form?.name ?? "Form"} — Responses
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              View and manage submissions for this form.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled>
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 mb-1">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Total
              </span>
            </div>
            <p className="text-2xl font-semibold text-foreground">
              {totalResponses}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Completed
              </span>
            </div>
            <p className="text-2xl font-semibold text-foreground">
              {completedCount}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-4 w-4 text-blue-500" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                In Progress
              </span>
            </div>
            <p className="text-2xl font-semibold text-foreground">
              {inProgressCount}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 mb-1">
              <XCircle className="h-4 w-4 text-amber-500" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Abandoned
              </span>
            </div>
            <p className="text-2xl font-semibold text-foreground">
              {abandonedCount}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Empty state */}
      {responses.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16">
          <Inbox className="h-10 w-10 text-muted-foreground mb-4" />
          <p className="text-sm font-medium text-foreground mb-1">
            No responses yet
          </p>
          <p className="text-sm text-muted-foreground">
            Responses will appear here once someone submits this form.
          </p>
        </div>
      )}

      {/* Card grid */}
      {responses.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {responses.map((response) => (
            <ActivityCard
              key={response.id}
              type="form_response"
              name={response.respondentEmail ?? "Anonymous"}
              email={response.respondentEmail ?? ""}
              title={form?.name ?? "Form"}
              status={response.status}
              date={response.createdAt ?? new Date().toISOString()}
              onClick={() => { setDrawerItem(response); setDrawerOpen(true); }}
            />
          ))}
        </div>
      )}

      {/* Response Detail Drawer */}
      <Sheet
        open={drawerOpen}
        onOpenChange={(v) => {
          if (!v) {
            setDrawerOpen(false);
            setDrawerItem(null);
          }
        }}
      >
        <SheetContent>
          <SheetHeader>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <FileText className="h-5 w-5 text-primary" />
              </div>
              <div>
                <SheetTitle>
                  {drawerItem?.respondentEmail ?? "Anonymous"}
                </SheetTitle>
                <SheetDescription>
                  {drawerItem
                    ? `Submitted ${formatDate(drawerItem.createdAt)}`
                    : ""}
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>

          {drawerItem && (
            <div className="space-y-6">
              {/* Details */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Details
                </p>
                <CopyableField
                  label="Form"
                  value={form?.name ?? "Form"}
                />
                <CopyableField
                  label="Submitted"
                  value={formatDate(drawerItem.createdAt)}
                />
                <div className="flex items-start justify-between gap-3 py-2.5">
                  <div>
                    <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-0.5">
                      Status
                    </p>
                    <Badge variant={statusVariant(drawerItem.status)}>
                      {statusLabel(drawerItem.status)}
                    </Badge>
                  </div>
                </div>
              </div>

              {/* Field values */}
              {drawerItem.values.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    Responses
                  </p>
                  {drawerItem.values.map((value) => (
                    <CopyableField
                      key={value.id}
                      label={value.fieldLabel}
                      value={value.displayValue}
                    />
                  ))}
                </div>
              )}

              {drawerItem.values.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No submitted field values for this response.
                </p>
              )}

              {/* Raw metadata */}
              {drawerItem.metadata != null &&
                typeof drawerItem.metadata === "object" &&
                Object.keys(drawerItem.metadata as Record<string, unknown>)
                  .length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                      Metadata
                    </p>
                    <pre className="text-xs text-muted-foreground bg-muted rounded-[12px] p-3 overflow-x-auto">
                      {JSON.stringify(drawerItem.metadata, null, 2)}
                    </pre>
                  </div>
                )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
