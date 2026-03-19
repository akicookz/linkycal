import { Star } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface FormFieldData {
  id: string;
  type: string;
  label: string;
  placeholder: string | null;
  required: boolean;
  options: Array<{ label: string; value: string }> | null;
}

// ─── Field Renderer ──────────────────────────────────────────────────────────

export function FormFieldRenderer({
  field,
  value,
  onChange,
  error,
}: {
  field: FormFieldData;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  const id = `field-${field.id}`;

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm font-medium">
        {field.label}
        {field.required && <span className="text-destructive ml-0.5">*</span>}
      </Label>

      {field.type === "textarea" ? (
        <textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder ?? undefined}
          required={field.required}
          rows={4}
          className={cn(
            "flex w-full rounded-[12px] border border-input bg-muted/50 px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 resize-y",
            error && "border-destructive",
          )}
        />
      ) : field.type === "select" ? (
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={field.required}
          className={cn(
            "flex h-10 w-full rounded-[12px] border border-input bg-muted/50 px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50",
            !value && "text-muted-foreground",
            error && "border-destructive",
          )}
        >
          <option value="">{field.placeholder || "Select an option"}</option>
          {field.options?.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      ) : field.type === "multi_select" ? (
        <div className="space-y-1.5">
          {field.options?.map((opt) => {
            const selected = value
              .split(",")
              .filter(Boolean)
              .includes(opt.value);
            return (
              <label
                key={opt.value}
                className={cn(
                  "flex items-center gap-2.5 rounded-[12px] border px-3 py-2.5 text-sm cursor-pointer transition-colors",
                  selected
                    ? "border-primary bg-primary/5"
                    : "border-input hover:border-primary/30",
                )}
              >
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => {
                    const current = value.split(",").filter(Boolean);
                    const next = selected
                      ? current.filter((v) => v !== opt.value)
                      : [...current, opt.value];
                    onChange(next.join(","));
                  }}
                  className="rounded"
                />
                {opt.label}
              </label>
            );
          })}
        </div>
      ) : field.type === "radio" ? (
        <div className="space-y-1.5">
          {field.options?.map((opt) => (
            <label
              key={opt.value}
              className={cn(
                "flex items-center gap-2.5 rounded-[12px] border px-3 py-2.5 text-sm cursor-pointer transition-colors",
                value === opt.value
                  ? "border-primary bg-primary/5"
                  : "border-input hover:border-primary/30",
              )}
            >
              <input
                type="radio"
                name={id}
                value={opt.value}
                checked={value === opt.value}
                onChange={() => onChange(opt.value)}
              />
              {opt.label}
            </label>
          ))}
        </div>
      ) : field.type === "checkbox" ? (
        <label className="flex items-center gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={value === "true"}
            onChange={(e) => onChange(e.target.checked ? "true" : "")}
            className="rounded"
          />
          <span className="text-sm">{field.placeholder || field.label}</span>
        </label>
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
        />
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
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
