import type { LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface AnalyticsBreakdownItem {
  label: string;
  value: number;
  displayValue?: string;
}

interface AnalyticsBreakdownCardProps {
  title: string;
  description?: string;
  emptyMessage?: string;
  icon: LucideIcon;
  items: AnalyticsBreakdownItem[];
  maxVisibleRows?: number;
}

export function AnalyticsBreakdownCard({
  title,
  description,
  emptyMessage,
  icon: Icon,
  items,
  maxVisibleRows,
}: AnalyticsBreakdownCardProps) {
  const visibleRows = maxVisibleRows
    ? Math.max(1, maxVisibleRows)
    : null;
  const hasOverflow = visibleRows !== null && items.length > visibleRows;

  return (
    <Card className="rounded-[20px]">
      <CardContent>
        <div className="mb-4 flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-primary/10">
            <Icon className="size-4 text-primary" />
          </div>
          <div>
            <h3 className="text-balance text-sm font-semibold">{title}</h3>
            {description && (
              <p className="mt-1 text-xs text-muted-foreground">
                {description}
              </p>
            )}
          </div>
        </div>
        {items.length === 0 ? (
          <p className="rounded-[14px] bg-muted/50 px-3 py-3 text-sm text-muted-foreground">
            {emptyMessage ?? "No data yet"}
          </p>
        ) : (
          <div
            aria-label={hasOverflow ? `${title} list` : undefined}
            className={cn(
              "space-y-2",
              visibleRows !== null && "overflow-y-auto overscroll-contain",
              hasOverflow &&
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            )}
            style={visibleRows === null
              ? undefined
              : { maxHeight: `${visibleRows * 52 - 8}px` }}
            tabIndex={hasOverflow ? 0 : undefined}
          >
            {items.map(function renderItem(item) {
              return (
                <div
                  key={item.label}
                  className="flex min-h-11 items-center justify-between gap-3 rounded-[14px] bg-muted/50 px-3 py-2"
                >
                  <span className="min-w-0 truncate text-sm font-medium">
                    {item.label}
                  </span>
                  <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                    {item.displayValue ??
                      `${item.value.toLocaleString()} visitors`}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
