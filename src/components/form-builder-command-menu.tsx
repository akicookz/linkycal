import { useEffect, useRef } from "react";
import type { FormBuilderCommandDef } from "@/lib/form-builder-commands";
import { cn } from "@/lib/utils";

export function FormBuilderCommandMenu({
  commands,
  activeIndex,
  onHover,
  onRun,
}: {
  commands: FormBuilderCommandDef[];
  activeIndex: number;
  onHover: (index: number) => void;
  onRun: (command: FormBuilderCommandDef) => void;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(
    function scrollActiveIntoView() {
      const item = activeRef.current;
      const scroller = scrollerRef.current;
      if (!item || !scroller) return;
      const itemRect = item.getBoundingClientRect();
      const scrollerRect = scroller.getBoundingClientRect();
      if (itemRect.bottom > scrollerRect.bottom) {
        scroller.scrollTop += itemRect.bottom - scrollerRect.bottom;
        return;
      }
      if (itemRect.top < scrollerRect.top) {
        scroller.scrollTop -= scrollerRect.top - itemRect.top;
      }
    },
    [activeIndex, commands],
  );

  if (commands.length === 0) {
    return (
      <p className="px-2 py-2 text-sm text-muted-foreground">No matching commands.</p>
    );
  }

  return (
    <div ref={scrollerRef} className="max-h-[320px] overflow-y-auto p-1.5">
      {commands.map(function renderCommand(command, index) {
        const Icon = command.icon;
        const active = index === activeIndex;
        return (
          <button
            key={command.id}
            ref={active ? activeRef : undefined}
            type="button"
            onMouseEnter={function hover() {
              onHover(index);
            }}
            onClick={function run() {
              onRun(command);
            }}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-[10px] px-2 py-1.5 text-left text-sm transition-colors",
              active ? "bg-muted/60" : "hover:bg-muted/60",
            )}
          >
            <span
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px]",
                command.chipClass ?? "bg-muted text-muted-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
            </span>
            {command.label}
          </button>
        );
      })}
    </div>
  );
}
