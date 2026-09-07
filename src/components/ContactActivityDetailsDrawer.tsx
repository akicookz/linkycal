import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  Brain,
  Loader,
  RefreshCw,
  Workflow,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { WorkflowResearchResult } from "@/components/WorkflowResearchResult";
import { WorkflowStepLog } from "@/components/WorkflowStepLog";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import type { ContactTimelineItem } from "@/lib/contact-activity";

interface WorkflowStepLogEntry {
  stepIndex: number;
  stepType: string;
  stepLabel: string;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

interface WorkflowRunDetail {
  id: string;
  workflowId: string;
  workflowName: string;
  status: "running" | "completed" | "failed";
  startedAt: string;
  completedAt: string | null;
  error: string | null;
  stepLogs: WorkflowStepLogEntry[] | null;
}

interface ContactActivityDetailsDrawerProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  item: Extract<ContactTimelineItem, { kind: "workflow_run" | "research" }> | null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function formatDateTime(value: string | null): string {
  if (!value) return "Not completed";
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function statusVariant(status: string) {
  if (status === "completed") return "success" as const;
  if (status === "failed") return "destructive" as const;
  return "warning" as const;
}

function ResearchDetails({ item }: { item: Extract<ContactTimelineItem, { kind: "research" }> }) {
  const record = asRecord(item.research);
  const sourceCount =
    typeof record.sourceCount === "number" ? record.sourceCount : undefined;

  return (
    <WorkflowResearchResult
      value={record}
      fallbackSummary={item.description}
      sourceCount={sourceCount}
    />
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}

export function ContactActivityDetailsDrawer({
  open,
  onClose,
  projectId,
  item,
}: ContactActivityDetailsDrawerProps) {
  const isMobile = useIsMobile();
  const workflowItem = item?.kind === "workflow_run" ? item : null;
  const runQuery = useQuery<WorkflowRunDetail>({
    queryKey: [
      "projects",
      projectId,
      "workflows",
      workflowItem?.workflowId,
      "runs",
      workflowItem?.runId,
    ],
    queryFn: async () => {
      const response = await fetch(
        `/api/projects/${projectId}/workflows/${workflowItem!.workflowId}/runs/${workflowItem!.runId}`,
      );
      if (!response.ok) throw new Error("Failed to load workflow run");
      const data = (await response.json()) as { run: WorkflowRunDetail };
      return data.run;
    },
    enabled: open && !!workflowItem,
    retry: false,
  });

  if (!item) return null;
  const isWorkflow = item.kind === "workflow_run";
  const run = runQuery.data;
  const stepLogs = Array.isArray(run?.stepLogs) ? run.stepLogs : [];

  return (
    <Sheet open={open} onOpenChange={(value) => !value && onClose()}>
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        className={cn(
          "flex min-w-0 max-w-full flex-col overflow-x-hidden overscroll-x-none",
          isMobile && "max-h-[88vh] rounded-t-[20px]",
        )}
      >
        <SheetHeader>
          <div className="flex items-center gap-3 pr-8">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
              {isWorkflow ? (
                <Workflow className="h-5 w-5 text-primary" />
              ) : (
                <Brain className="h-5 w-5 text-primary" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <SheetTitle className="truncate">{run?.workflowName ?? item.title}</SheetTitle>
              <SheetDescription>
                {isWorkflow ? "Workflow run details" : formatDateTime(item.occurredAt)}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        {isWorkflow ? (
          runQuery.isPending ? (
            <div className="flex flex-1 items-center justify-center py-12">
              <Loader className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : runQuery.isError ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 py-12 text-center">
              <AlertCircle className="h-8 w-8 text-destructive" />
              <p className="text-sm text-muted-foreground">Could not load this workflow run.</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="transition-[background-color,color,scale] active:scale-[0.96]"
                onClick={() => runQuery.refetch()}
              >
                <RefreshCw className="h-4 w-4" />
                Try again
              </Button>
            </div>
          ) : run ? (
            <div className="flex-1 space-y-5 overflow-y-auto">
              <section className="space-y-3 rounded-[16px] bg-muted/50 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-muted-foreground">Status</span>
                  <Badge variant={statusVariant(run.status)}>{run.status}</Badge>
                </div>
                <DetailRow label="Started" value={formatDateTime(run.startedAt)} />
                <DetailRow label="Completed" value={formatDateTime(run.completedAt)} />
                {run.error && (
                  <div className="flex gap-2 rounded-[12px] bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{run.error}</span>
                  </div>
                )}
              </section>

              <section className="space-y-3">
                <h3 className="text-sm font-medium">Steps</h3>
                {stepLogs.length > 0 ? (
                  stepLogs.map((step) => (
                    <div key={`${step.stepIndex}-${step.stepLabel}`} className="space-y-2 rounded-[16px] bg-muted/50 px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-medium">{step.stepLabel}</span>
                        <Badge variant={statusVariant(step.status)}>{step.status}</Badge>
                      </div>
                      <WorkflowStepLog
                        stepType={step.stepType}
                        input={step.input}
                        output={step.output}
                        error={step.error}
                      />
                    </div>
                  ))
                ) : (
                  <p className="rounded-[16px] bg-muted/50 px-4 py-3 text-sm text-muted-foreground">No step logs are available for this run.</p>
                )}
              </section>
            </div>
          ) : null
        ) : (
          <div className="flex-1 overflow-y-auto">
            <ResearchDetails item={item} />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
