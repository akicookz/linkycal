import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { useId } from "react";

import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export function SwitchRow({
  title,
  description,
  className,
  id,
  disabled,
  ...switchProps
}: {
  title: ReactNode;
  description?: ReactNode;
} & ComponentPropsWithoutRef<typeof Switch>) {
  const generatedId = useId();
  const switchId = id ?? generatedId;

  return (
    <div
      className={cn(
        "rounded-[16px] bg-muted/50 px-4 py-3",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <label
          htmlFor={switchId}
          className={cn(
            "min-w-0 flex-1 text-sm font-medium leading-5",
            disabled && "cursor-not-allowed",
          )}
        >
          {title}
        </label>
        <Switch
          id={switchId}
          disabled={disabled}
          className="shrink-0"
          {...switchProps}
        />
      </div>
      {description ? (
        <label
          htmlFor={switchId}
          className={cn(
            "mt-0.5 block text-xs leading-5 text-muted-foreground",
            disabled && "cursor-not-allowed",
          )}
        >
          {description}
        </label>
      ) : null}
    </div>
  );
}
