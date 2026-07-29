import type { LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

export interface AnalyticsBreakdownItem {
  label: string;
  value: number;
}

interface AnalyticsBreakdownCardProps {
  title: string;
  icon: LucideIcon;
  items: AnalyticsBreakdownItem[];
}

export function AnalyticsBreakdownCard({
  title,
  icon: Icon,
  items,
}: AnalyticsBreakdownCardProps) {
  if (items.length === 0) return null;

  return (
    <Card className="rounded-[20px]">
      <CardContent>
        <div className="mb-4 flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-primary/10">
            <Icon className="size-4 text-primary" />
          </div>
          <h3 className="text-balance text-sm font-semibold">{title}</h3>
        </div>
        <div className="space-y-2">
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
                  {item.value.toLocaleString()} visitors
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
