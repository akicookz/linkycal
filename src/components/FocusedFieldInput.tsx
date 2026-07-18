import { useEffect, useRef } from "react";
import { Check, Star, Upload, X } from "lucide-react";
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

export type FocusedFieldDensity = "comfortable" | "compact";

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
// Focused answer controls with comfortable standalone and compact booking
// density. `onCommit` fires when the respondent signals they're done with the
// question so the parent can advance to the next screen.

export function FocusedFieldInput({
  field,
  value,
  onChange,
  fileValue,
  onFileChange,
  onCommit,
  autoFocus = false,
  error,
  density = "comfortable",
}: {
  field: FocusedFieldData;
  value: string;
  onChange: (value: string) => void;
  fileValue?: File | null;
  onFileChange?: (file: File | null) => void;
  onCommit?: (trigger: "enter" | "choice") => void;
  autoFocus?: boolean;
  error?: string;
  density?: FocusedFieldDensity;
}) {
  if (field.type === "completion") return null;

  if (field.type === "file") {
    return (
      <FocusedFileInput
        value={value}
        fileValue={fileValue}
        onChange={(file) => {
          onFileChange?.(file);
          onChange(file?.name ?? "");
        }}
        autoFocus={autoFocus}
        placeholder={field.placeholder || "Choose a file"}
        error={error}
        density={density}
      />
    );
  }

  if (field.type === "textarea") {
    return (
      <FocusedTextarea
        inputId={field.id}
        value={value}
        onChange={onChange}
        onCommit={onCommit}
        autoFocus={autoFocus}
        placeholder={field.placeholder || "Type your answer here..."}
        error={error}
        density={density}
      />
    );
  }

  if (field.type === "rating") {
    return (
      <FocusedRating
        value={value}
        onChange={onChange}
        onCommit={onCommit}
        density={density}
      />
    );
  }

  if (field.type === "checkbox") {
    const selected = value === "true";
    return (
      <div className="space-y-2.5" data-control-density={density}>
        <FocusedChoiceCard
          letter="Y"
          label={field.placeholder || "I agree"}
          selected={selected}
          density={density}
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
      <div className="space-y-2.5" data-control-density={density}>
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
              density={density}
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
    <div className="space-y-2" data-control-density={density}>
      <input
        id={field.id}
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
          "ring-shadow w-full rounded-[12px] border-0 bg-primary/[0.03] px-4 font-medium tracking-[-0.01em] text-foreground placeholder:text-muted-foreground/45 placeholder:font-normal outline-none transition-[background-color,box-shadow] duration-150 ease-out focus:bg-primary/[0.045] focus:ring-shadow-[var(--primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring/60",
          density === "compact"
            ? "h-11 text-base sm:text-lg"
            : "h-12 text-lg sm:text-xl",
          error &&
            "ring-shadow-[color-mix(in_srgb,var(--destructive)_60%,transparent)] focus:ring-shadow-[var(--destructive)]",
        )}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

// ─── File Input ──────────────────────────────────────────────────────────────

const FORM_FILE_ACCEPT =
  ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.jpg,.jpeg,.png,.webp,.gif";

function FocusedFileInput({
  value,
  fileValue,
  onChange,
  autoFocus,
  placeholder,
  error,
  density,
}: {
  value: string;
  fileValue?: File | null;
  onChange: (file: File | null) => void;
  autoFocus: boolean;
  placeholder: string;
  error?: string;
  density: FocusedFieldDensity;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const displayName = fileValue?.name || value || placeholder;

  function clearFile() {
    if (ref.current) {
      ref.current.value = "";
    }
    onChange(null);
  }

  return (
    <div className="space-y-2" data-control-density={density}>
      <label
        className={cn(
          "ring-shadow flex w-full cursor-pointer items-center border-0 text-left transition-[background-color,box-shadow,transform] duration-150 ease-out hover:bg-primary/[0.065] hover:ring-shadow-[color-mix(in_srgb,var(--primary)_32%,transparent)] active:scale-[0.96] focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring/60",
          density === "compact"
            ? "min-h-11 max-w-none gap-3 rounded-[12px] px-3.5 py-3"
            : "min-h-12 max-w-xl gap-3.5 rounded-[14px] px-4 py-3.5",
          "bg-primary/[0.035]",
          error &&
            "ring-shadow-[color-mix(in_srgb,var(--destructive)_60%,transparent)]",
        )}
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-primary/10 text-primary">
          <Upload className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-medium text-foreground">
            {displayName}
          </span>
          <span className="mt-1 block text-xs text-muted-foreground">
            PDF, documents, spreadsheets, presentations, text, CSV, or images up to 10MB
          </span>
        </span>
        <input
          ref={ref}
          type="file"
          accept={FORM_FILE_ACCEPT}
          autoFocus={autoFocus}
          onChange={(e) => onChange(e.target.files?.[0] ?? null)}
          className="sr-only"
          aria-invalid={error ? true : undefined}
        />
      </label>
      {(fileValue || value) && (
        <button
          type="button"
          onClick={clearFile}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-[10px] px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-primary/10 hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
          Clear file
        </button>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

// ─── Textarea ────────────────────────────────────────────────────────────────

function FocusedTextarea({
  inputId,
  value,
  onChange,
  onCommit,
  autoFocus,
  placeholder,
  error,
  density,
}: {
  inputId: string;
  value: string;
  onChange: (value: string) => void;
  onCommit?: (trigger: "enter" | "choice") => void;
  autoFocus: boolean;
  placeholder: string;
  error?: string;
  density: FocusedFieldDensity;
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
    <div className="space-y-2" data-control-density={density}>
      <textarea
        id={inputId}
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
          "ring-shadow w-full resize-none overflow-hidden rounded-[12px] border-0 bg-primary/[0.03] px-4 py-3 font-medium tracking-[-0.01em] text-foreground placeholder:text-muted-foreground/45 placeholder:font-normal outline-none transition-[background-color,box-shadow] duration-150 ease-out focus:bg-primary/[0.045] focus:ring-shadow-[var(--primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring/60",
          density === "compact"
            ? "min-h-11 text-base sm:text-lg"
            : "min-h-12 text-lg sm:text-xl",
          error &&
            "ring-shadow-[color-mix(in_srgb,var(--destructive)_60%,transparent)] focus:ring-shadow-[var(--destructive)]",
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
  density,
}: {
  letter: string;
  label: string;
  selected: boolean;
  onSelect: () => void;
  density: FocusedFieldDensity;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      data-focused-choice="true"
      className={cn(
        "ring-shadow flex w-full items-center border-0 text-left transition-[background-color,box-shadow,transform] duration-150 ease-out active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring/60",
        density === "compact"
          ? "min-h-11 max-w-none gap-3 rounded-[12px] px-3.5 py-2.5"
          : "min-h-12 max-w-xl gap-3.5 rounded-[14px] px-4 py-3.5",
        selected
          ? "ring-shadow-[var(--primary)] bg-primary/[0.09]"
          : "bg-primary/[0.035] hover:bg-primary/[0.065] hover:ring-shadow-[color-mix(in_srgb,var(--primary)_32%,transparent)]",
      )}
    >
      <span
        className={cn(
          "ring-shadow flex shrink-0 items-center justify-center border-0 text-xs font-semibold transition-[background-color,color,box-shadow] duration-150",
          density === "compact"
            ? "h-6 w-6 rounded-[7px]"
            : "h-7 w-7 rounded-[8px]",
          selected
            ? "ring-shadow-[var(--primary)] bg-primary text-primary-foreground"
            : "bg-background/80 text-primary",
        )}
      >
        {letter}
      </span>
      <span
        className={cn(
          "min-w-0 flex-1 font-medium leading-snug text-foreground text-pretty",
          density === "compact" ? "text-sm sm:text-[15px]" : "text-[15px] sm:text-base",
        )}
      >
        {label}
      </span>
      <Check
        className={cn(
          "h-4 w-4 shrink-0 text-primary transition-opacity duration-150",
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
  density,
}: {
  value: string;
  onChange: (value: string) => void;
  onCommit?: (trigger: "enter" | "choice") => void;
  density: FocusedFieldDensity;
}) {
  const rating = parseInt(value) || 0;
  return (
    <div className="flex gap-1.5" data-control-density={density}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => {
            onChange(star.toString());
            onCommit?.("choice");
          }}
          className="group flex h-10 w-10 items-center justify-center rounded-[10px] transition-transform hover:scale-110 active:scale-[0.96]"
          aria-label={`${star} star${star === 1 ? "" : "s"}`}
        >
          <Star
            className={cn(
              density === "compact" ? "h-7 w-7" : "h-8 w-8",
              "transition-colors",
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
