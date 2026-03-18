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
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";


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

function formatShortDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
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

function truncateValue(value: string | null, maxLen = 40): string {
  if (!value) return "-";
  return value.length > maxLen ? value.slice(0, maxLen) + "..." : value;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function FormResponses() {
  const { projectId, formId } = useParams<{
    projectId: string;
    formId: string;
  }>();
  const navigate = useNavigate();

  const [selectedResponseId, setSelectedResponseId] = useState<string | null>(
    null
  );

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

  // Flatten all fields from all steps for column headers
  const allFields: FormField[] = form
    ? form.steps
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .flatMap((step) =>
          [...step.fields].sort((a, b) => a.sortOrder - b.sortOrder)
        )
    : [];

  // Limit visible columns to prevent overflow
  const visibleFields = allFields.slice(0, 5);
  const hasMoreFields = allFields.length > 5;

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

  // ─── Selected response for detail view ───────────────────────────────────

  const selectedResponse = responses.find((r) => r.id === selectedResponseId);

  function getValueForField(
    response: FormResponse,
    fieldId: string
  ): string | null {
    const val = response.values.find((v) => v.fieldId === fieldId);
    if (!val) return null;
    return val.fileUrl || val.value;
  }

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
        <div className="grid grid-cols-4 gap-4 mb-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-4 pb-4">
                <Skeleton className="h-4 w-16 mb-2" />
                <Skeleton className="h-8 w-12" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardContent className="pt-4">
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
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
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() =>
              navigate(`/app/projects/${projectId}/forms/${formId}`)
            }
          >
            <ArrowLeft className="h-4 w-4" />
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
        <div className="rounded-[20px] border">
          <div className="flex flex-col items-center justify-center py-16">
            <Inbox className="h-10 w-10 text-muted-foreground mb-4" />
            <p className="text-sm font-medium text-foreground mb-1">
              No responses yet
            </p>
            <p className="text-sm text-muted-foreground">
              Responses will appear here once someone submits this form.
            </p>
          </div>
        </div>
      )}

      {/* Responses table */}
      {responses.length > 0 && (
        <div className="rounded-[20px] border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">
                    Respondent
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">
                    Submitted
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">
                    Status
                  </th>
                  {visibleFields.map((field) => (
                    <th
                      key={field.id}
                      className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap max-w-[200px]"
                    >
                      {field.label}
                    </th>
                  ))}
                  {hasMoreFields && (
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">
                      +{allFields.length - 5} more
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {responses.map((response) => (
                  <tr
                    key={response.id}
                    className="border-b last:border-b-0 hover:bg-muted/20 cursor-pointer transition-colors"
                    onClick={() => setSelectedResponseId(response.id)}
                  >
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-sm text-foreground">
                        {response.respondentEmail || "Anonymous"}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                      {formatShortDate(response.createdAt)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Badge variant={statusVariant(response.status)} className="text-[11px]">
                        {statusLabel(response.status)}
                      </Badge>
                    </td>
                    {visibleFields.map((field) => (
                      <td
                        key={field.id}
                        className="px-4 py-3 text-muted-foreground max-w-[200px] truncate"
                      >
                        {truncateValue(
                          getValueForField(response, field.id)
                        )}
                      </td>
                    ))}
                    {hasMoreFields && (
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        ...
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Response Detail Dialog */}
      <Dialog
        open={!!selectedResponseId}
        onOpenChange={(open) => !open && setSelectedResponseId(null)}
      >
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Response Details</DialogTitle>
            <DialogDescription>
              {selectedResponse
                ? `Submitted ${formatDate(selectedResponse.createdAt)}`
                : ""}
            </DialogDescription>
          </DialogHeader>

          {selectedResponse && (
            <div className="space-y-4">
              {/* Meta */}
              <div className="flex items-center gap-3">
                <Badge variant={statusVariant(selectedResponse.status)}>
                  {statusLabel(selectedResponse.status)}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  {selectedResponse.respondentEmail || "Anonymous"}
                </span>
              </div>

              <Separator />

              {/* Field values */}
              <div className="space-y-3">
                {allFields.map((field) => {
                  const rawValue = getValueForField(
                    selectedResponse,
                    field.id
                  );
                  return (
                    <div key={field.id}>
                      <p className="text-xs font-medium text-muted-foreground mb-0.5">
                        {field.label}
                      </p>
                      {rawValue ? (
                        field.type === "file" ? (
                          <a
                            href={rawValue}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-primary hover:underline break-all"
                          >
                            {rawValue}
                          </a>
                        ) : (
                          <p className="text-sm text-foreground whitespace-pre-wrap break-words">
                            {rawValue}
                          </p>
                        )
                      ) : (
                        <p className="text-sm text-muted-foreground italic">
                          No response
                        </p>
                      )}
                    </div>
                  );
                })}

                {allFields.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No fields configured for this form.
                  </p>
                )}
              </div>

              {/* Raw metadata (if any) */}
              {selectedResponse.metadata != null &&
                typeof selectedResponse.metadata === "object" &&
                Object.keys(selectedResponse.metadata as Record<string, unknown>).length >
                  0 && (
                  <>
                    <Separator />
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">
                        Metadata
                      </p>
                      <pre className="text-xs text-muted-foreground bg-muted rounded-[12px] p-3 overflow-x-auto">
                        {JSON.stringify(selectedResponse.metadata, null, 2)}
                      </pre>
                    </div>
                  </>
                )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
