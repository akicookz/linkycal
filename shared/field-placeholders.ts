export const FIELD_TYPE_PLACEHOLDERS: Record<string, string | null> = {
  name: "Full name",
  text: "Start typing...",
  textarea: "Start typing...",
  email: "name@example.com",
  phone: "+1 (555) 000-0000",
  url: "https://example.com",
  number: "0",
  completion: null,
  date: "Select a date",
  time: "Select a time",
  select: null,
  multi_select: null,
  radio: null,
  checkbox: null,
  rating: null,
  file: "Choose a file",
};

export function defaultPlaceholderForFieldType(type: string): string | null {
  return FIELD_TYPE_PLACEHOLDERS[type] ?? null;
}

export function defaultOptionsForFieldType(
  type: string,
): Array<{ label: string; value: string }> | null {
  if (type === "select" || type === "multi_select") {
    return [
      { label: "Option 1", value: "option_1" },
      { label: "Option 2", value: "option_2" },
    ];
  }
  if (type === "radio") {
    return [{ label: "Option 1", value: "option_1" }];
  }
  return null;
}
