import type { ReactNode } from "react";
import { Check, Star } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  contactMapping?: string | null;
}

// ─── Field Renderer ──────────────────────────────────────────────────────────

export function FormFieldRenderer({
  field,
  value,
  onChange,
  error,
  textareaRows = 4,
  themeColor,
  themeTextColor,
  themeRadius,
}: {
  field: FormFieldData;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  textareaRows?: number;
  themeColor?: string;
  themeTextColor?: string;
  themeRadius?: number;
}) {
  const id = `field-${field.id}`;
  const showsFieldLabel = field.type !== "checkbox";
  const showsChoiceHint =
    field.type !== "checkbox" &&
    isChoiceField(field.type) &&
    !!field.placeholder &&
    !(field.type === "select" && !field.required);
  const labelTargetId =
    field.type === "rating" || isChoiceField(field.type) ? undefined : id;

  // Completion fields are not rendered as form inputs
  if (field.type === "completion") return null;

  const themed = !!themeColor;
  const themeVars: React.CSSProperties | undefined = themeColor
    ? ({
        ["--primary" as string]: themeColor,
        ["--primary-foreground" as string]: themeTextColor || "#ffffff",
        ["--ring" as string]: themeColor,
      } as React.CSSProperties)
    : undefined;

  return (
    <div className="space-y-1.5" style={themeVars}>
      {showsFieldLabel && (
        <Label htmlFor={labelTargetId} className="text-sm font-medium">
          {field.label}
          {field.required && <span className="text-destructive ml-0.5">*</span>}
        </Label>
      )}

      {field.description && (
        <div
          className="text-xs leading-5 text-muted-foreground prose prose-sm max-w-none"
          dangerouslySetInnerHTML={{ __html: field.description }}
        />
      )}

      {showsChoiceHint && (
        <p className="text-xs leading-5 text-muted-foreground">
          {field.placeholder}
        </p>
      )}

      {field.type === "textarea" ? (
        <textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder ?? undefined}
          required={field.required}
          rows={textareaRows}
          className={cn(
            "flex w-full rounded-[12px] border border-input bg-muted/50 px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 resize-y",
            error && "border-destructive",
          )}
          style={themeRadius != null ? { borderRadius: `${themeRadius}px` } : undefined}
        />
      ) : field.type === "select" ? (
        <ChoiceFieldGroup
          id={id}
          mode="select"
          options={field.options}
          value={value}
          onChange={onChange}
          allowEmpty={!field.required}
          emptyLabel={field.placeholder || "No selection"}
          error={error}
          themeRadius={themeRadius}
          themed={themed}
        />
      ) : field.type === "multi_select" ? (
        <ChoiceFieldGroup
          id={id}
          mode="multi_select"
          options={field.options}
          value={value}
          onChange={onChange}
          error={error}
          themeRadius={themeRadius}
          themed={themed}
        />
      ) : field.type === "radio" ? (
        <ChoiceFieldGroup
          id={id}
          mode="radio"
          options={field.options}
          value={value}
          onChange={onChange}
          error={error}
          themeRadius={themeRadius}
          themed={themed}
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
          themeRadius={themeRadius}
          themed={themed}
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
          className={cn(error && "border-destructive")}
          style={themeRadius != null ? { borderRadius: `${themeRadius}px` } : undefined}
        />
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

// ─── Choice Fields ────────────────────────────────────────────────────────────

type ChoiceMode = "select" | "multi_select" | "radio";

function isChoiceField(type: string): type is ChoiceMode {
  return type === "select" || type === "multi_select" || type === "radio";
}

function ChoiceFieldGroup({
  id,
  mode,
  options,
  value,
  onChange,
  allowEmpty = false,
  emptyLabel,
  error,
  themeRadius,
  themed,
}: {
  id: string;
  mode: ChoiceMode;
  options: Array<{ label: string; value: string }> | null;
  value: string;
  onChange: (value: string) => void;
  allowEmpty?: boolean;
  emptyLabel?: string;
  error?: string;
  themeRadius?: number;
  themed?: boolean;
}) {
  const selectedValues = value.split(",").filter(Boolean);
  const usesRadioIndicator = mode === "radio";

  return (
    <div className="space-y-2">
      {mode === "select" && allowEmpty && (
        <ChoiceCard
          title={emptyLabel || "No selection"}
          description="Leave this blank for now"
          selected={!value}
          control="checkbox"
          error={!!error}
          themeRadius={themeRadius}
          themed={themed}
        >
          <input
            type="radio"
            name={id}
            value=""
            checked={!value}
            onChange={() => onChange("")}
            className="sr-only"
            aria-invalid={error ? true : undefined}
          />
        </ChoiceCard>
      )}

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
            themeRadius={themeRadius}
            themed={themed}
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
  themeRadius,
  themed,
}: {
  title: ReactNode;
  description?: string | null;
  selected: boolean;
  control: "checkbox" | "radio";
  error?: boolean;
  children: ReactNode;
  themeRadius?: number;
  themed?: boolean;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center gap-4 rounded-[16px] border px-4 py-3.5 transition-all",
        "bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(244,247,245,0.92))]",
        !themed && "shadow-[0_12px_26px_-24px_rgba(15,26,20,0.42)]",
        selected
          ? themed
            ? "border-primary/40 bg-primary/5 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]"
            : "border-primary/40 bg-primary/5 shadow-[inset_0_1px_0_rgba(255,255,255,0.72),0_16px_32px_-28px_rgba(27,67,50,0.35)]"
          : themed
            ? "border-[rgba(15,23,20,0.10)] hover:border-primary/25 hover:bg-white"
            : "border-[rgba(27,67,50,0.10)] hover:border-primary/25 hover:bg-white",
        error && !selected && "border-destructive/35",
      )}
      style={themeRadius != null ? { borderRadius: `${themeRadius}px` } : undefined}
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
        "ml-3 flex h-5 w-5 shrink-0 items-center justify-center border transition-all",
        control === "radio" ? "rounded-full" : "rounded-[6px]",
        selected
          ? "border-primary bg-primary text-primary-foreground"
          : "border-[rgba(27,67,50,0.18)] bg-white text-transparent",
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
          className="p-0.5 transition-colors"
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
