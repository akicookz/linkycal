import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { FormBuilderCommandMenu } from "@/components/form-builder-command-menu";
import { useFormBuilderCommandMenu } from "@/hooks/use-form-builder-command-menu";
import type {
  FormBuilderCommandDef,
  FormBuilderCommandHandlers,
  InsertionContext,
} from "@/lib/form-builder-commands";
import { runFormBuilderCommand, visibleCommands } from "@/lib/form-builder-commands";
import { findScrollParent, scrollNodeIntoNearest } from "@/lib/form-builder-slash";
import type { FormPageLayout } from "@/lib/form-pages";
import { cn } from "@/lib/utils";

export interface FormBuilderCaretHandle {
  focusAndOpen(): void;
}

export const FormBuilderCaret = forwardRef<
  FormBuilderCaretHandle,
  {
    gapIndex: number;
    commands: readonly FormBuilderCommandDef[];
    getContext: (gapIndex: number) => InsertionContext;
    handlers: FormBuilderCommandHandlers;
    layout?: FormPageLayout;
    variant?: "gap" | "empty";
    edge?: "before" | "after";
  }
>(function FormBuilderCaret(
  {
    gapIndex,
    commands,
    getContext,
    handlers,
    layout,
    variant = "gap",
    edge = "after",
  },
  ref,
) {
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const ctx = getContext(gapIndex);
  const menu = useFormBuilderCommandMenu();
  const { close, open, openMenu } = menu;
  const visible = visibleCommands(commands, ctx, menu.query, layout);
  const safeIndex =
    visible.length === 0 ? 0 : Math.min(menu.activeIndex, visible.length - 1);

  function scrollCaretAndMenu() {
    const root = rootRef.current;
    if (root) root.scrollIntoView({ block: "nearest", inline: "nearest" });
    const menuEl = menuRef.current;
    if (!menuEl) return;
    scrollNodeIntoNearest(menuEl, root ? findScrollParent(root) : null);
  }

  useImperativeHandle(ref, function bindHandle() {
    return {
      focusAndOpen() {
        openMenu();
        inputRef.current?.focus();
        scrollCaretAndMenu();
        requestAnimationFrame(function afterOpen() {
          requestAnimationFrame(scrollCaretAndMenu);
        });
      },
    };
  }, [openMenu]);

  useEffect(
    function closeOnOutside() {
      if (!open) return;
      function onPointerDown(event: PointerEvent) {
        if (!rootRef.current?.contains(event.target as Node)) {
          close();
        }
      }
      document.addEventListener("pointerdown", onPointerDown);
      return function cleanup() {
        document.removeEventListener("pointerdown", onPointerDown);
      };
    },
    [close, open],
  );

  function runCommand(command: FormBuilderCommandDef) {
    runFormBuilderCommand(command, ctx, handlers);
    menu.close();
  }

  function runAt(index: number) {
    const command = visible[index];
    if (command) runCommand(command);
  }

  return (
    <div
      ref={rootRef}
      className={cn(
        "relative",
        variant === "gap" && "absolute inset-x-0 h-6",
        variant === "gap" &&
          (edge === "before" ? "bottom-full" : "top-full"),
        variant === "gap" && (menu.open ? "z-50" : "z-0"),
      )}
    >
      <label
        className={cn(
          "group/caret flex cursor-text items-center rounded-[12px] transition-colors",
          variant === "empty" ? "px-2 py-1.5" : "h-full px-1",
          menu.open && "bg-muted/40",
        )}
      >
        <input
          ref={inputRef}
          value={menu.open ? `/${menu.query}` : ""}
          placeholder={
            variant === "empty" ? "Type / to add a field" : "Type /"
          }
          aria-label="Insert with slash command"
          className={cn(
            "min-w-0 flex-1 bg-transparent text-left text-muted-foreground outline-none placeholder:text-muted-foreground/70",
            variant === "gap"
              ? "text-xs"
              : "text-sm",
            variant === "gap" &&
              !menu.open &&
              "opacity-0 group-hover/caret:opacity-100 group-focus-within/caret:opacity-100",
          )}
          onChange={function onChange(event) {
            const value = event.target.value;
            if (value === "") {
              menu.close();
              return;
            }
            if (!value.startsWith("/")) return;
            if (!menu.open) menu.openMenu();
            menu.setQuery(value.slice(1));
          }}
          onKeyDown={function onKeyDown(event) {
            menu.handleKeyDown(event, {
              itemCount: visible.length,
              onRun: runAt,
            });
          }}
        />
      </label>
      {menu.open ? (
        <div
          ref={menuRef}
          className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-[16px] border bg-popover text-popover-foreground shadow-md"
        >
          <FormBuilderCommandMenu
            commands={visible}
            activeIndex={safeIndex}
            onHover={menu.setActiveIndex}
            onRun={runCommand}
          />
        </div>
      ) : null}
    </div>
  );
});
