import { useRef, type ReactNode, type RefObject } from "react";
import { Check, Star, Upload, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  optionsLayoutClassName,
  parseOptionsLayout,
  type OptionsLayout,
} from "@/lib/form-field-settings";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface FormFieldData {
  id: string;
  type: string;
  label: string;
  description: string | null;
  placeholder: string | null;
  required: boolean;
  options: Array<{ label: string; value: string }> | null;
  settings?: Record<string, unknown> | null;
  contactMapping?: string | null;
}

// ─── Field Renderer ──────────────────────────────────────────────────────────

export type FormFieldChrome = "full" | "control";

export function FormFieldRenderer({
  field,
  value,
  onChange,
  fileValue,
  onFileChange,
  error,
  textareaRows = 4,
  chrome = "full",
}: {
  field: FormFieldData;
  value: string;
  onChange: (value: string) => void;
  fileValue?: File | null;
  onFileChange?: (file: File | null) => void;
  error?: string;
  textareaRows?: number;
  chrome?: FormFieldChrome;
}) {
  const id = `field-${field.id}`;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const showsFieldLabel = field.type !== "checkbox";
  const showsChoiceHint =
    field.type !== "checkbox" &&
    isChoiceField(field.type) &&
    isCustomChoiceHint(field.placeholder);
  const labelTargetId =
    field.type === "rating" || isChoiceField(field.type) ? undefined : id;

  // Completion fields are not rendered as form inputs
  if (field.type === "completion") return null;

  const showChrome = chrome === "full";
  const hasSupportingCopy = Boolean(field.description) || showsChoiceHint;

  return (
    <div className={cn(showChrome && "space-y-1.5", showChrome && !hasSupportingCopy && "space-y-3")}>
      {showChrome && showsFieldLabel && (
        <Label htmlFor={labelTargetId} className="text-sm font-medium">
          {field.label}
          {field.required && <span className="text-destructive ml-0.5">*</span>}
        </Label>
      )}

      {showChrome && field.description && (
        <div
          className="text-xs leading-5 text-muted-foreground prose prose-sm max-w-none"
          dangerouslySetInnerHTML={{ __html: field.description }}
        />
      )}

      {showChrome && showsChoiceHint && (
        <p className="text-xs leading-5 text-muted-foreground">
          {field.placeholder}
        </p>
      )}

      {field.type === "textarea" ? (
        <Textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder ?? undefined}
          required={field.required}
          rows={textareaRows}
          aria-invalid={error ? true : undefined}
          variant="focused"
        />
      ) : field.type === "select" ? (
        <ChoiceFieldGroup
          id={id}
          mode="select"
          options={field.options}
          layout={parseOptionsLayout(field.settings)}
          value={value}
          onChange={onChange}
          error={error}
        />
      ) : field.type === "multi_select" ? (
        <ChoiceFieldGroup
          id={id}
          mode="multi_select"
          options={field.options}
          layout={parseOptionsLayout(field.settings)}
          value={value}
          onChange={onChange}
          error={error}
        />
      ) : field.type === "radio" ? (
        <ChoiceFieldGroup
          id={id}
          mode="radio"
          options={field.options}
          layout={parseOptionsLayout(field.settings)}
          value={value}
          onChange={onChange}
          error={error}
        />
      ) : field.type === "checkbox" ? (
        <ChoiceCard
          title={
            <>
              {field.label}
              {field.required && <span className="text-destructive ml-0.5">*</span>}
            </>
          }
          description={field.placeholder}
          selected={value === "true"}
          control="checkbox"
          error={!!error}
        >
          <input
            id={id}
            type="checkbox"
            checked={value === "true"}
            onChange={(e) => onChange(e.target.checked ? "true" : "")}
            required={field.required}
            className="sr-only"
            aria-invalid={error ? true : undefined}
          />
        </ChoiceCard>
      ) : field.type === "rating" ? (
        <RatingInput value={value} onChange={onChange} />
      ) : field.type === "file" ? (
        <FileInput
          id={id}
          inputRef={fileInputRef}
          value={value}
          fileValue={fileValue}
          placeholder={field.placeholder}
          required={field.required}
          error={error}
          onChange={(file) => {
            onFileChange?.(file);
            onChange(file?.name ?? "");
          }}
        />
      ) : (
        <Input
          id={id}
          type={
            field.type === "email"
              ? "email"
              : field.type === "phone"
                ? "tel"
                : field.type === "url"
                  ? "url"
                  : field.type === "number"
                    ? "number"
                    : field.type === "date"
                      ? "date"
                      : field.type === "time"
                        ? "time"
                        : "text"
          }
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder ?? undefined}
          required={field.required}
          aria-invalid={error ? true : undefined}
          variant="focused"
        />
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

// ─── File Input ──────────────────────────────────────────────────────────────

const FORM_FILE_ACCEPT =
  ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.jpg,.jpeg,.png,.webp,.gif";

function FileInput({
  id,
  inputRef,
  value,
  fileValue,
  placeholder,
  required,
  error,
  onChange,
}: {
  id: string;
  inputRef: RefObject<HTMLInputElement | null>;
  value: string;
  fileValue?: File | null;
  placeholder?: string | null;
  required?: boolean;
  error?: string;
  onChange: (file: File | null) => void;
}) {
  const displayName = fileValue?.name || value || placeholder || "Choose a file";

  function clearFile() {
    if (inputRef.current) {
      inputRef.current.value = "";
    }
    onChange(null);
  }

  return (
    <div className="space-y-2">
      <label
        htmlFor={id}
        className={cn(
          "flex cursor-pointer items-center gap-3 rounded-[var(--radius)] border-0 bg-field-fill px-4 py-3.5 ring-shadow transition-all hover:ring-shadow-[color-mix(in_srgb,var(--primary)_32%,transparent)]",
          error &&
          "ring-shadow-[color-mix(in_srgb,var(--destructive)_60%,transparent)]",
        )}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius)] bg-primary/10 text-primary">
          <Upload className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-foreground">
            {displayName}
          </span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            PDF, documents, spreadsheets, presentations, text, CSV, or images up to 10MB
          </span>
        </span>
      </label>
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={FORM_FILE_ACCEPT}
        required={required}
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
        className="sr-only"
        aria-invalid={error ? true : undefined}
      />
      {(fileValue || value) && (
        <button
          type="button"
          onClick={clearFile}
          className="inline-flex items-center gap-1.5 rounded-[var(--radius)] px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
          Clear file
        </button>
      )}
    </div>
  );
}

// ─── Choice Fields ────────────────────────────────────────────────────────────

type ChoiceMode = "select" | "multi_select" | "radio";

const CANNED_CHOICE_HINTS = new Set(["Select an option", "Select options"]);

function isChoiceField(type: string): type is ChoiceMode {
  return type === "select" || type === "multi_select" || type === "radio";
}

function isCustomChoiceHint(placeholder: string | null): boolean {
  const hint = placeholder?.trim() ?? "";
  return hint.length > 0 && !CANNED_CHOICE_HINTS.has(hint);
}

function ChoiceFieldGroup({
  id,
  mode,
  options,
  layout,
  value,
  onChange,
  error,
}: {
  id: string;
  mode: ChoiceMode;
  options: Array<{ label: string; value: string }> | null;
  layout: OptionsLayout;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  const selectedValues = value.split(",").filter(Boolean);
  const usesRadioIndicator = mode === "radio";

  return (
    <div
      className={optionsLayoutClassName(
        layout,
        "space-y-2",
        "grid gap-2 md:grid-cols-2",
      )}
    >
      {options?.map((option, index) => {
        const selected =
          mode === "multi_select"
            ? selectedValues.includes(option.value)
            : value === option.value;

        return (
          <ChoiceCard
            key={`${option.value}-${index}`}
            title={option.label}
            selected={selected}
            control={usesRadioIndicator ? "radio" : "checkbox"}
            error={!!error}
          >
            <input
              type={mode === "multi_select" ? "checkbox" : "radio"}
              name={mode === "multi_select" ? undefined : id}
              value={option.value}
              checked={selected}
              onChange={() => handleChoiceChange(mode, value, option.value, onChange)}
              className="sr-only"
              aria-invalid={error ? true : undefined}
            />
          </ChoiceCard>
        );
      })}
    </div>
  );
}

function handleChoiceChange(
  mode: ChoiceMode,
  value: string,
  optionValue: string,
  onChange: (value: string) => void,
) {
  if (mode === "multi_select") {
    const current = value.split(",").filter(Boolean);
    const next = current.includes(optionValue)
      ? current.filter((item) => item !== optionValue)
      : [...current, optionValue];
    onChange(next.join(","));
    return;
  }

  onChange(optionValue);
}

function ChoiceCard({
  title,
  description,
  selected,
  control,
  error,
  children,
}: {
  title: ReactNode;
  description?: string | null;
  selected: boolean;
  control: "checkbox" | "radio";
  error?: boolean;
  children: ReactNode;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center gap-4 rounded-[var(--radius)] border-0 px-4 ring-shadow transition-all",
        description ? "min-h-11 py-2.5" : "h-11",
        selected
          ? "bg-field-fill ring-shadow-[var(--primary)]"
          : "bg-field-fill hover:ring-shadow-[color-mix(in_srgb,var(--primary)_32%,transparent)]",
        error &&
        !selected &&
        "ring-shadow-[color-mix(in_srgb,var(--destructive)_60%,transparent)]",
      )}
    >
      {children}
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium leading-5 text-foreground">
          {title}
        </div>
        {description && (
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      <ChoiceIndicator selected={selected} control={control} />
    </label>
  );
}

function ChoiceIndicator({
  selected,
  control,
}: {
  selected: boolean;
  control: "checkbox" | "radio";
}) {
  return (
    <span
      className={cn(
        "ml-3 flex h-5 w-5 shrink-0 items-center justify-center border-0 ring-shadow transition-all",
        control === "radio" ? "rounded-full" : "rounded-[6px]",
        selected
          ? "bg-primary text-primary-foreground ring-shadow-[var(--primary)]"
          : "bg-background/80 text-transparent",
      )}
    >
      {control === "radio" ? (
        <span
          className={cn(
            "h-2 w-2 rounded-full bg-current transition-opacity",
            selected ? "opacity-100" : "opacity-0",
          )}
        />
      ) : (
        <Check
          className={cn(
            "h-3.5 w-3.5 transition-opacity",
            selected ? "opacity-100" : "opacity-0",
          )}
        />
      )}
    </span>
  );
}

// ─── Rating Input ────────────────────────────────────────────────────────────

function RatingInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const rating = parseInt(value) || 0;
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star.toString())}
          className="p-0.5 rounded-[var(--radius)] transition-colors"
        >
          <Star
            className={cn(
              "h-6 w-6",
              star <= rating
                ? "fill-yellow-400 text-yellow-400"
                : "text-muted-foreground",
            )}
          />
        </button>
      ))}
    </div>
  );
}
