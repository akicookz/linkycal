import { useState, type ComponentType, type MouseEvent, type ReactNode } from "react";
import { MoreVertical } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

export interface ActionsSheetItem {
  id: string;
  label: string;
  icon?: ComponentType<{ className?: string }>;
  onClick: () => void;
  variant?: "default" | "destructive";
  disabled?: boolean;
}

interface ActionsSheetProps {
  items: ActionsSheetItem[];
  title?: string;
  align?: "start" | "center" | "end";
  trigger?: ReactNode;
  triggerClassName?: string;
}

export function ActionsSheet({
  items,
  title = "Actions",
  align = "end",
  trigger,
  triggerClassName,
}: ActionsSheetProps) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  function handleTriggerClick(event: MouseEvent) {
    event.stopPropagation();
    setOpen(true);
  }

  function handleSelect(item: ActionsSheetItem) {
    if (item.disabled) return;
    setOpen(false);
    item.onClick();
  }

  const defaultTrigger = (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn("h-7 w-7 shrink-0", triggerClassName)}
      aria-label={title}
      onClick={isMobile ? handleTriggerClick : undefined}
    >
      <MoreVertical className="h-4 w-4" />
    </Button>
  );

  const list = (
    <div className="flex flex-col">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            type="button"
            disabled={item.disabled}
            onClick={(event) => {
              event.stopPropagation();
              handleSelect(item);
            }}
            className={cn(
              "flex min-h-11 w-full items-center gap-3 rounded-[12px] px-3 py-2.5 text-left text-sm font-medium transition-colors disabled:opacity-50",
              item.variant === "destructive"
                ? "text-destructive hover:bg-destructive/10"
                : "text-foreground hover:bg-muted/60",
            )}
          >
            {Icon ? <Icon className="h-4 w-4 shrink-0" /> : null}
            {item.label}
          </button>
        );
      })}
    </div>
  );

  if (isMobile) {
    return (
      <>
        <div onClick={(event) => event.stopPropagation()}>
          {trigger ? (
            <span className="inline-flex" onClick={handleTriggerClick}>
              {trigger}
            </span>
          ) : (
            defaultTrigger
          )}
        </div>
        <Sheet open={open} onOpenChange={setOpen} modal>
          <SheetContent
            side="bottom"
            hideCloseButton
            className="rounded-t-[20px] px-4 pb-8 pt-1"
          >
            <SheetHeader className="mb-2">
              <SheetTitle className="text-base">{title}</SheetTitle>
            </SheetHeader>
            {list}
          </SheetContent>
        </Sheet>
      </>
    );
  }

  return (
    <div onClick={(event) => event.stopPropagation()}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          {trigger ?? defaultTrigger}
        </PopoverTrigger>
        <PopoverContent align={align} className="w-56 p-1.5">
          {list}
        </PopoverContent>
      </Popover>
    </div>
  );
}
