export type FormPrefillField = {
  id: string;
  type: string;
  options?: Array<{ label: string; value: string }> | null;
};

export type FormPrefillQuery = Record<string, string | string[]>;

function firstValue(value: string | string[] | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) return value[0];
  return value;
}

function normalizeMultiValues(
  value: string | string[] | undefined,
): string[] {
  if (value === undefined) return [];
  const arr = Array.isArray(value) ? value : [value];
  return arr
    .flatMap((entry) => entry.split(","))
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function coerceForField(
  field: FormPrefillField,
  raw: string | string[] | undefined,
): string | null {
  if (raw === undefined) return null;

  switch (field.type) {
    case "file":
      return null;

    case "select":
    case "radio": {
      const v = firstValue(raw);
      if (v === undefined) return null;
      const allowed = field.options?.some((option) => option.value === v);
      return allowed ? v : null;
    }

    case "multi_select": {
      const values = normalizeMultiValues(raw);
      const allowed = field.options ?? [];
      const kept = values.filter((v) => allowed.some((o) => o.value === v));
      return kept.length > 0 ? kept.join(",") : null;
    }

    case "checkbox": {
      const hasOptions = (field.options?.length ?? 0) > 0;
      if (hasOptions) {
        const values = normalizeMultiValues(raw);
        const allowed = field.options ?? [];
        const kept = values.filter((v) => allowed.some((o) => o.value === v));
        return kept.length > 0 ? kept.join(",") : null;
      }
      const v = firstValue(raw);
      if (v === undefined) return null;
      const lower = v.trim().toLowerCase();
      const truthy = ["1", "true", "yes", "on"].includes(lower);
      return truthy ? "true" : "false";
    }

    case "rating": {
      const v = firstValue(raw);
      if (v === undefined) return null;
      const num = Number(v);
      if (!Number.isFinite(num)) return null;
      const int = Math.round(num);
      if (int < 1 || int > 5) return null;
      return String(int);
    }

    default: {
      const v = firstValue(raw);
      return typeof v === "string" ? v : null;
    }
  }
}

export function prefillFromQuery(
  fields: FormPrefillField[],
  query: FormPrefillQuery,
): Record<string, string> {
  const out: Record<string, string> = {};

  for (const field of fields) {
    if (!(field.id in query)) continue;
    const coerced = coerceForField(field, query[field.id]);
    if (coerced !== null) {
      out[field.id] = coerced;
    }
  }

  return out;
}

export function parseQueryString(search: string): FormPrefillQuery {
  const params = new URLSearchParams(search);
  const out: FormPrefillQuery = {};
  for (const key of new Set(params.keys())) {
    const all = params.getAll(key);
    out[key] = all.length > 1 ? all : all[0];
  }
  return out;
}
