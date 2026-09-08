import { cn } from "@/lib/utils";

const MAX_VISIBLE_STEPS = 5;

export interface FocusedStepProgressProps {
  current: number;
  total: number;
  className?: string;
  surface?: "standalone" | "booking" | "preview";
}

type StepDotSize = "active" | "normal" | "small";

interface VisibleStepDot {
  index: number;
  size: StepDotSize;
}

function getVisibleStepDots(current: number, total: number): VisibleStepDot[] {
  if (total <= MAX_VISIBLE_STEPS) {
    return Array.from({ length: total }, (_, index) => ({
      index,
      size: index === current ? "active" : "normal",
    }));
  }

  const lastStart = total - MAX_VISIBLE_STEPS;
  let start = current - Math.floor(MAX_VISIBLE_STEPS / 2);
  if (start < 0) start = 0;
  if (start > lastStart) start = lastStart;

  return Array.from({ length: MAX_VISIBLE_STEPS }, (_, offset) => {
    const index = start + offset;
    const isFirst = offset === 0;
    const isLast = offset === MAX_VISIBLE_STEPS - 1;
    const moreBefore = start > 0;
    const moreAfter = start + MAX_VISIBLE_STEPS < total;
    let size: StepDotSize = "normal";
    if (index === current) size = "active";
    else if ((isFirst && moreBefore) || (isLast && moreAfter)) size = "small";
    return { index, size };
  });
}

export function FocusedStepProgress(props: FocusedStepProgressProps) {
  const { current, total, className, surface = "standalone" } = props;
  if (total <= 1 || current < 0) return null;

  const dots = getVisibleStepDots(current, total);

  return (
    <div
      data-focused-progress={surface}
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={total}
      aria-valuenow={current + 1}
      aria-label={`Question ${current + 1} of ${total}`}
      className={cn("pointer-events-none flex w-full items-center gap-1", className)}
    >
      {dots.map((dot) => (
        <span
          key={dot.index}
          className={cn(
            "min-w-0 rounded-full transition-all duration-300",
            dot.size === "small" ? "h-0.5 flex-[0.45]" : "h-1 flex-1",
            dot.index <= current ? "bg-primary" : "bg-primary/15",
          )}
        />
      ))}
    </div>
  );
}
