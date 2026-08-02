import { cn } from "@/lib/utils";

interface UsageMeterProps {
  used: number;
  limit: number;
  hardLimit?: number | null;
  className?: string;
  formatValue?: (value: number) => string;
}

export function UsageMeter({
  used,
  limit,
  hardLimit,
  className,
  formatValue = formatCount,
}: UsageMeterProps) {
  const ceiling = hardLimit ?? limit;
  const percent = ceiling <= 0 ? 100 : Math.min(100, (used / ceiling) * 100);
  const inGrace = hardLimit != null && hardLimit > limit && used >= limit;

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between gap-4 text-xs">
        <span className="font-medium tabular-nums">
          {formatValue(used)} of {formatValue(limit)} used
        </span>
        {inGrace ? (
          <span className="font-medium text-amber-700">Grace capacity</span>
        ) : null}
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={ceiling}
        aria-valuenow={Math.min(used, ceiling)}
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-300",
            inGrace ? "bg-amber-500" : "bg-brand",
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}
