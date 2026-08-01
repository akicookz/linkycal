import {
  CalendarDays,
  CheckCircle2,
  CircleHelp,
  Clock3,
  Eye,
  FileText,
  Group,
  Info,
  ListChecks,
  MessageSquareText,
  MousePointerClick,
  Send,
  UserRound,
  type LucideIcon,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import type { FunnelStageReport } from "../../../shared/funnel-analytics";

interface DetailedFunnelProps {
  availableSince: string | null;
  stages: FunnelStageReport[];
}

const stageIcons: Record<string, LucideIcon> = {
  page: Eye,
  date: CalendarDays,
  availability: ListChecks,
  time: Clock3,
  details: UserRound,
  statement: FileText,
  question: CircleHelp,
  group: Group,
  step: MousePointerClick,
  submit: Send,
  completion: CheckCircle2,
};

const compactNumberFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

function formatCompactNumber(value: number): string {
  return compactNumberFormatter.format(value);
}

function formatTrackingDate(value: string): string {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function DetailedFunnel({
  availableSince,
  stages,
}: DetailedFunnelProps) {
  return (
    <Card className="rounded-[20px]">
      <CardContent>
        <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-balance text-sm font-semibold">
              Exact step drop-offs
            </h3>
            <p className="mt-1 text-pretty text-xs text-muted-foreground">
              Each person is counted once per stage. A skip counts as
              continuation, not a drop-off.
            </p>
          </div>
          {availableSince && (
            <div className="flex max-w-sm items-center gap-2 rounded-[12px] bg-primary/10 px-3 py-2 text-xs text-primary">
              <Info className="size-4 shrink-0" />
              <span>
                Detailed step tracking began{" "}
                <strong>{formatTrackingDate(availableSince)}</strong>
              </span>
            </div>
          )}
        </div>

        <div className="space-y-3">
          {stages.map(function renderStage(stage) {
            const Icon = stageIcons[stage.kind] ?? MessageSquareText;

            return (
              <div
                key={stage.key}
                className="rounded-[18px] bg-muted/45 p-2 shadow-[0_0_0_1px_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)]"
              >
                <div
                  role="group"
                  aria-label={`${stage.label} funnel stage`}
                  className="grid gap-3 rounded-[12px] bg-background px-3 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] sm:items-center"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-primary/10">
                      <Icon className="size-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {stage.label}
                      </p>
                      <p className="mt-0.5 text-xs capitalize text-muted-foreground">
                        {stage.kind} stage
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-x-4 pl-[52px] sm:pl-0">
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">Visitors</p>
                      <p className="whitespace-nowrap text-sm font-semibold tabular-nums">
                        {formatCompactNumber(stage.visitors)}
                      </p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">Continued</p>
                      <p className="whitespace-nowrap text-sm font-semibold tabular-nums text-primary">
                        {Math.round(stage.continuationRate)}
                      </p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">Drop-off</p>
                      <p className="whitespace-nowrap text-sm font-semibold tabular-nums">
                        {Math.round(stage.dropOffRate)}
                      </p>
                    </div>
                  </div>
                </div>

                {typeof stage.skipped === "number" && stage.skipped > 0 && (
                  <p className="px-3 pb-1 pt-2 text-right text-xs font-medium tabular-nums text-muted-foreground">
                    {stage.skipped.toLocaleString()} skipped
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
