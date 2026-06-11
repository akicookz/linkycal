import { useEffect, useRef } from "react";
import { Check, Star } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface FocusedFieldData {
  id: string;
  type: string;
  label: string;
  description: string | null;
  placeholder: string | null;
  required: boolean;
  options: Array<{ label: string; value: string }> | null;
}

export function isChoiceFieldType(type: string): boolean {
  return (
    type === "select" ||
    type === "multi_select" ||
    type === "radio" ||
    type === "checkbox"
  );
}

export function isMultiChoiceFieldType(type: string): boolean {
  return type === "multi_select";
}

export function choiceLetter(index: number): string {
  return String.fromCharCode(65 + (index % 26));
}

function inputTypeFor(type: string): string {
  switch (type) {
    case "email":
      return "email";
    case "phone":
      return "tel";
    case "url":
      return "url";
    case "number":
      return "number";
    case "date":
      return "date";
    case "time":
      return "time";
    default:
      return "text";
  }
}

// ─── Focused Field Input ─────────────────────────────────────────────────────
//
// Typeform-style answer controls: oversized underline inputs, lettered choice
// cards, large rating stars. `onCommit` fires when the respondent signals
// they're done with this question (Enter on an input, or picking a
// single-choice option) so the parent can advance to the next screen.

export function FocusedFieldInput({
  field,
  value,
  onChange,
  onCommit,
  autoFocus = false,
  error,
}: {
  field: FocusedFieldData;
  value: string;
  onChange: (value: string) => void;
  onCommit?: (trigger: "enter" | "choice") => void;
  autoFocus?: boolean;
  error?: string;
}) {
  if (field.type === "completion") return null;

  if (field.type === "textarea") {
    return (
      <FocusedTextarea
        value={value}
        onChange={onChange}
        onCommit={onCommit}
        autoFocus={autoFocus}
        placeholder={field.placeholder || "Type your answer here..."}
        error={error}
      />
    );
  }

  if (field.type === "rating") {
    return (
      <FocusedRating
        value={value}
        onChange={onChange}
        onCommit={onCommit}
      />
    );
  }

  if (field.type === "checkbox") {
    const selected = value === "true";
    return (
      <div className="space-y-2.5">
        <FocusedChoiceCard
          letter="Y"
          label={field.placeholder || "I agree"}
          selected={selected}
          onSelect={() => {
            onChange(selected ? "" : "true");
            if (!selected) onCommit?.("choice");
          }}
        />
      </div>
    );
  }

  if (isChoiceFieldType(field.type)) {
    const multi = isMultiChoiceFieldType(field.type);
    const selectedValues = value.split(",").filter(Boolean);
    return (
      <div className="space-y-2.5">
        {(field.options ?? []).map((option, index) => {
          const selected = multi
            ? selectedValues.includes(option.value)
            : value === option.value;
          return (
            <FocusedChoiceCard
              key={`${option.value}-${index}`}
              letter={choiceLetter(index)}
              label={option.label}
              selected={selected}
              onSelect={() => {
                if (multi) {
                  const next = selected
                    ? selectedValues.filter((item) => item !== option.value)
                    : [...selectedValues, option.value];
                  onChange(next.join(","));
                  return;
                }
                onChange(selected ? "" : option.value);
                if (!selected) onCommit?.("choice");
              }}
            />
          );
        })}
        {multi && (
          <p className="text-xs text-muted-foreground">
            Choose as many as you like
          </p>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <input
        type={inputTypeFor(field.type)}
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onCommit?.("enter");
          }
        }}
        placeholder={field.placeholder || "Type your answer here..."}
        className={cn(
          "w-full bg-transparent border-0 border-b-2 border-primary/25 pb-2 text-xl sm:text-2xl font-medium text-foreground placeholder:text-muted-foreground/40 placeholder:font-normal outline-none transition-colors focus:border-primary",
          error && "border-destructive/60 focus:border-destructive",
        )}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

// ─── Textarea ────────────────────────────────────────────────────────────────

function FocusedTextarea({
  value,
  onChange,
  onCommit,
  autoFocus,
  placeholder,
  error,
}: {
  value: string;
  onChange: (value: string) => void;
  onCommit?: (trigger: "enter" | "choice") => void;
  autoFocus: boolean;
  placeholder: string;
  error?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [value]);

  return (
    <div className="space-y-2">
      <textarea
        ref={ref}
        rows={1}
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onCommit?.("enter");
          }
        }}
        placeholder={placeholder}
        className={cn(
          "w-full resize-none overflow-hidden bg-transparent border-0 border-b-2 border-primary/25 pb-2 text-xl sm:text-2xl font-medium text-foreground placeholder:text-muted-foreground/40 placeholder:font-normal outline-none transition-colors focus:border-primary",
          error && "border-destructive/60 focus:border-destructive",
        )}
      />
      <p className="text-xs text-muted-foreground">
        <span className="font-semibold">Shift ⇧ + Enter ↵</span> to make a line
        break
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

// ─── Choice Card ─────────────────────────────────────────────────────────────

function FocusedChoiceCard({
  letter,
  label,
  selected,
  onSelect,
}: {
  letter: string;
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full max-w-md items-center gap-3 rounded-[12px] border px-4 py-3 text-left transition-all",
        selected
          ? "border-primary bg-primary/10 shadow-[0_0_0_1px_var(--primary)_inset]"
          : "border-primary/30 bg-primary/[0.04] hover:bg-primary/10",
      )}
    >
      <span
        className={cn(
          "flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] border text-xs font-semibold transition-colors",
          selected
            ? "border-primary bg-primary text-primary-foreground"
            : "border-primary/40 bg-background text-primary",
        )}
      >
        {letter}
      </span>
      <span className="min-w-0 flex-1 text-base font-medium text-foreground">
        {label}
      </span>
      <Check
        className={cn(
          "h-5 w-5 shrink-0 text-primary transition-opacity",
          selected ? "opacity-100" : "opacity-0",
        )}
      />
    </button>
  );
}

// ─── Rating ──────────────────────────────────────────────────────────────────

function FocusedRating({
  value,
  onChange,
  onCommit,
}: {
  value: string;
  onChange: (value: string) => void;
  onCommit?: (trigger: "enter" | "choice") => void;
}) {
  const rating = parseInt(value) || 0;
  return (
    <div className="flex gap-2">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => {
            onChange(star.toString());
            onCommit?.("choice");
          }}
          className="group p-1 transition-transform hover:scale-110"
          aria-label={`${star} star${star === 1 ? "" : "s"}`}
        >
          <Star
            className={cn(
              "h-9 w-9 transition-colors",
              star <= rating
                ? "fill-primary text-primary"
                : "text-primary/30 group-hover:text-primary/60",
            )}
          />
        </button>
      ))}
    </div>
  );
}
