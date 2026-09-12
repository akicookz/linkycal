export type OptionsLayout = "one" | "two";

const CHOICE_LAYOUT_TYPES = new Set(["select", "multi_select", "radio"]);

export function isChoiceLayoutFieldType(type: string): boolean {
  return CHOICE_LAYOUT_TYPES.has(type);
}

export function parseOptionsLayout(settings: unknown): OptionsLayout {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return "one";
  }
  return (settings as Record<string, unknown>).optionsLayout === "two"
    ? "two"
    : "one";
}

export function withOptionsLayout(
  settings: unknown,
  layout: OptionsLayout,
): Record<string, unknown> | null {
  const current =
    settings && typeof settings === "object" && !Array.isArray(settings)
      ? { ...(settings as Record<string, unknown>) }
      : {};
  if (layout === "two") current.optionsLayout = "two";
  else delete current.optionsLayout;
  return Object.keys(current).length > 0 ? current : null;
}

export function optionsLayoutClassName(
  layout: OptionsLayout,
  stackedClassName: string,
  twoColumnClassName: string,
): string {
  return layout === "two" ? twoColumnClassName : stackedClassName;
}
