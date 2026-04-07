import {
  useState,
  useRef,
  useEffect,
  useCallback,
  forwardRef,
  type KeyboardEvent,
  type ChangeEvent,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import {
  filterVariables,
  WORKFLOW_VARIABLES,
  type WorkflowVariableGroup,
} from "@/lib/workflow-variables";

// ─── Shared Autocomplete Logic ──────────────────────────────────────────────

interface AutocompleteState {
  open: boolean;
  query: string;
  startIndex: number;
  highlightedIndex: number;
}

function getVariableTrigger(
  value: string,
  cursorPos: number,
): { query: string; startIndex: number } | null {
  const before = value.slice(0, cursorPos);
  const match = before.match(/\{\{([^{}]*)$/);
  if (!match) return null;
  return { query: match[1], startIndex: before.length - match[0].length };
}

function flattenGroups(groups: WorkflowVariableGroup[]) {
  return groups.flatMap((g) =>
    g.items.map((item) => ({ ...item, group: g.group, icon: g.icon })),
  );
}

// ─── Autocomplete Popover ───────────────────────────────────────────────────

interface PopoverProps {
  anchorRef: React.RefObject<HTMLElement | null>;
  state: AutocompleteState;
  variables: WorkflowVariableGroup[];
  onSelect: (key: string) => void;
  onClose: () => void;
}

function AutocompletePopover({ anchorRef, state, variables, onSelect, onClose }: PopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });

  useEffect(() => {
    if (!state.open || !anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    setPosition({
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width,
    });
  }, [state.open, anchorRef]);

  useEffect(() => {
    if (!state.open) return;
    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [state.open, onClose]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (!state.open || !popoverRef.current) return;
    const el = popoverRef.current.querySelector("[data-highlighted='true']");
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [state.highlightedIndex, state.open]);

  if (!state.open) return null;

  const filtered = filterVariables(state.query, variables);
  const flat = flattenGroups(filtered);

  if (flat.length === 0) return null;

  let itemIndex = 0;

  return createPortal(
    <div
      ref={popoverRef}
      className="fixed z-50 max-h-64 overflow-y-auto rounded-[12px] border border-border bg-background shadow-lg"
      style={{ top: position.top, left: position.left, width: Math.min(position.width, 380) }}
    >
      <div className="p-1">
        {filtered.map((group) => (
          <div key={group.group}>
            <div className="flex items-center gap-1.5 px-2 py-1.5">
              <group.icon className="h-3 w-3 text-muted-foreground" />
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                {group.group}
              </span>
            </div>
            {group.items.map((item) => {
              const currentIndex = itemIndex++;
              const isHighlighted = currentIndex === state.highlightedIndex;
              return (
                <button
                  key={item.key}
                  type="button"
                  data-highlighted={isHighlighted}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-[8px] px-2 py-1.5 text-left text-sm transition-colors",
                    isHighlighted ? "bg-muted" : "hover:bg-muted/50",
                  )}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onSelect(item.key);
                  }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <code className="text-xs font-mono text-primary shrink-0">
                      {`{{${item.key}}}`}
                    </code>
                    <span className="text-xs text-muted-foreground truncate">{item.label}</span>
                  </div>
                  {item.example && (
                    <span className="text-[10px] text-muted-foreground/60 shrink-0 font-mono">
                      {item.example}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>,
    document.body,
  );
}

// ─── Shared Hook ────────────────────────────────────────────────────────────

function useVariableAutocomplete(
  variables: WorkflowVariableGroup[],
  getValue: () => string,
  setValue: (value: string, cursorPos: number) => void,
) {
  const [state, setState] = useState<AutocompleteState>({
    open: false,
    query: "",
    startIndex: 0,
    highlightedIndex: 0,
  });

  const checkTrigger = useCallback(
    (value: string, cursorPos: number) => {
      const trigger = getVariableTrigger(value, cursorPos);
      if (trigger) {
        const filtered = flattenGroups(filterVariables(trigger.query, variables));
        setState({
          open: filtered.length > 0,
          query: trigger.query,
          startIndex: trigger.startIndex,
          highlightedIndex: 0,
        });
      } else {
        setState((s) => (s.open ? { ...s, open: false } : s));
      }
    },
    [variables],
  );

  const selectVariable = useCallback(
    (key: string) => {
      const value = getValue();
      const replacement = `{{${key}}}`;
      // Find end of current partial (look for closing }} or end of text)
      const afterStart = value.slice(state.startIndex);
      const closingMatch = afterStart.match(/^\{\{[^{}]*\}\}/);
      const endIndex = closingMatch
        ? state.startIndex + closingMatch[0].length
        : state.startIndex + 2 + state.query.length; // {{ + query length

      const newValue =
        value.slice(0, state.startIndex) + replacement + value.slice(endIndex);
      const newCursor = state.startIndex + replacement.length;
      setValue(newValue, newCursor);
      setState((s) => ({ ...s, open: false }));
    },
    [getValue, state.startIndex, state.query, setValue],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!state.open) return;

      const filtered = flattenGroups(filterVariables(state.query, variables));
      const count = filtered.length;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setState((s) => ({
            ...s,
            highlightedIndex: (s.highlightedIndex + 1) % count,
          }));
          break;
        case "ArrowUp":
          e.preventDefault();
          setState((s) => ({
            ...s,
            highlightedIndex: (s.highlightedIndex - 1 + count) % count,
          }));
          break;
        case "Enter":
        case "Tab":
          if (filtered[state.highlightedIndex]) {
            e.preventDefault();
            selectVariable(filtered[state.highlightedIndex].key);
          }
          break;
        case "Escape":
          e.preventDefault();
          setState((s) => ({ ...s, open: false }));
          break;
      }
    },
    [state.open, state.query, state.highlightedIndex, variables, selectVariable],
  );

  const close = useCallback(() => {
    setState((s) => ({ ...s, open: false }));
  }, []);

  return { state, checkTrigger, selectVariable, handleKeyDown, close };
}

// ─── VariableInput ──────────────────────────────────────────────────────────

interface VariableInputProps extends Omit<React.ComponentProps<"input">, "onChange"> {
  variables?: WorkflowVariableGroup[];
  value?: string;
  onChange?: (e: ChangeEvent<HTMLInputElement>) => void;
  onValueChange?: (value: string) => void;
}

const VariableInput = forwardRef<HTMLInputElement, VariableInputProps>(
  function VariableInput(
    { variables = WORKFLOW_VARIABLES, className, onChange, onValueChange, value = "", ...props },
    forwardedRef,
  ) {
    const innerRef = useRef<HTMLInputElement>(null);
    const ref = (forwardedRef ?? innerRef) as React.RefObject<HTMLInputElement | null>;

    const { state, checkTrigger, selectVariable, handleKeyDown, close } =
      useVariableAutocomplete(
        variables,
        () => ref.current?.value ?? "",
        (newValue: string, cursorPos: number) => {
          if (ref.current) {
            // Fire synthetic change event
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
              window.HTMLInputElement.prototype,
              "value",
            )?.set;
            nativeInputValueSetter?.call(ref.current, newValue);
            const event = new Event("input", { bubbles: true });
            ref.current.dispatchEvent(event);
            // Set cursor after React re-render
            requestAnimationFrame(() => {
              ref.current?.setSelectionRange(cursorPos, cursorPos);
            });
          }
          onValueChange?.(newValue);
        },
      );

    function handleChange(e: ChangeEvent<HTMLInputElement>) {
      onChange?.(e);
      onValueChange?.(e.target.value);
      const cursorPos = e.target.selectionStart ?? e.target.value.length;
      checkTrigger(e.target.value, cursorPos);
    }

    function handleClick() {
      if (ref.current) {
        checkTrigger(ref.current.value, ref.current.selectionStart ?? 0);
      }
    }

    return (
      <>
        <input
          ref={ref}
          type="text"
          data-slot="input"
          value={value}
          className={cn(
            "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground border-border h-10 w-full min-w-0 rounded-[12px] border bg-muted/50 px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
            "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
            "aria-invalid:ring-destructive/20 aria-invalid:border-destructive",
            className,
          )}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onClick={handleClick}
          {...props}
        />
        <AutocompletePopover
          anchorRef={ref}
          state={state}
          variables={variables}
          onSelect={selectVariable}
          onClose={close}
        />
      </>
    );
  },
);

// ─── VariableTextarea ───────────────────────────────────────────────────────

interface VariableTextareaProps extends Omit<React.ComponentProps<"textarea">, "onChange"> {
  variables?: WorkflowVariableGroup[];
  value?: string;
  onChange?: (e: ChangeEvent<HTMLTextAreaElement>) => void;
  onValueChange?: (value: string) => void;
}

const VariableTextarea = forwardRef<HTMLTextAreaElement, VariableTextareaProps>(
  function VariableTextarea(
    { variables = WORKFLOW_VARIABLES, className, onChange, onValueChange, value = "", ...props },
    forwardedRef,
  ) {
    const innerRef = useRef<HTMLTextAreaElement>(null);
    const ref = (forwardedRef ?? innerRef) as React.RefObject<HTMLTextAreaElement | null>;

    const { state, checkTrigger, selectVariable, handleKeyDown, close } =
      useVariableAutocomplete(
        variables,
        () => ref.current?.value ?? "",
        (newValue: string, cursorPos: number) => {
          if (ref.current) {
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
              window.HTMLTextAreaElement.prototype,
              "value",
            )?.set;
            nativeInputValueSetter?.call(ref.current, newValue);
            const event = new Event("input", { bubbles: true });
            ref.current.dispatchEvent(event);
            requestAnimationFrame(() => {
              ref.current?.setSelectionRange(cursorPos, cursorPos);
            });
          }
          onValueChange?.(newValue);
        },
      );

    function handleChange(e: ChangeEvent<HTMLTextAreaElement>) {
      onChange?.(e);
      onValueChange?.(e.target.value);
      const cursorPos = e.target.selectionStart ?? e.target.value.length;
      checkTrigger(e.target.value, cursorPos);
    }

    function handleClick() {
      if (ref.current) {
        checkTrigger(ref.current.value, ref.current.selectionStart ?? 0);
      }
    }

    return (
      <>
        <textarea
          ref={ref}
          value={value}
          className={cn(
            "flex w-full rounded-[12px] border border-input bg-muted/50 px-3 py-2 text-sm shadow-xs ring-offset-background transition-[color,box-shadow] outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 resize-y",
            "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
            className,
          )}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onClick={handleClick}
          {...props}
        />
        <AutocompletePopover
          anchorRef={ref}
          state={state}
          variables={variables}
          onSelect={selectVariable}
          onClose={close}
        />
      </>
    );
  },
);

export { VariableInput, VariableTextarea };
