export interface AfterSubmitSettings {
  title?: string;
  message?: string;
  redirectUrl?: string;
}

export interface AfterSubmitSource {
  label: string;
  description: string | null;
  settings: unknown;
}

export interface ResolvedAfterSubmit {
  title: string;
  messageHtml: string | null;
  fallbackText: string | null;
  redirectUrl: string | null;
}

export const DEFAULT_AFTER_SUBMIT_TITLE = "Thank you!";
export const DEFAULT_AFTER_SUBMIT_TEXT =
  "Your response has been submitted successfully.";

function trimOrEmpty(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function redirectFromUnknown(settings: unknown): string {
  if (!settings || typeof settings !== "object") return "";
  return trimOrEmpty((settings as Record<string, unknown>).redirectUrl);
}

export function hasAfterSubmitSettings(settings: unknown): boolean {
  if (!settings || typeof settings !== "object") return false;
  return Object.prototype.hasOwnProperty.call(settings, "afterSubmit");
}

export function parseAfterSubmit(settings: unknown): AfterSubmitSettings {
  if (!settings || typeof settings !== "object") return {};
  const raw = (settings as Record<string, unknown>).afterSubmit;
  if (!raw || typeof raw !== "object") return {};
  const record = raw as Record<string, unknown>;
  const parsed: AfterSubmitSettings = {};
  const title = trimOrEmpty(record.title);
  const message = typeof record.message === "string" ? record.message : "";
  const redirectUrl = trimOrEmpty(record.redirectUrl);
  if (title) parsed.title = title;
  if (message.trim()) parsed.message = message;
  if (redirectUrl) parsed.redirectUrl = redirectUrl;
  return parsed;
}

export function afterSubmitFromCompletion(
  field: AfterSubmitSource | null,
): AfterSubmitSettings | null {
  if (!field) return null;
  const next: AfterSubmitSettings = {};
  const title = trimOrEmpty(field.label);
  const message = field.description ?? "";
  const redirectUrl = redirectFromUnknown(field.settings);
  if (title) next.title = title;
  if (message.trim()) next.message = message;
  if (redirectUrl) next.redirectUrl = redirectUrl;
  return Object.keys(next).length > 0 ? next : null;
}

export function compactAfterSubmit(
  value: AfterSubmitSettings | undefined,
): AfterSubmitSettings | undefined {
  if (!value) return undefined;
  const next: AfterSubmitSettings = {};
  const title = trimOrEmpty(value.title);
  const message = typeof value.message === "string" ? value.message : "";
  const redirectUrl = trimOrEmpty(value.redirectUrl);
  if (title) next.title = title;
  if (message.trim()) next.message = message;
  if (redirectUrl) next.redirectUrl = redirectUrl;
  return Object.keys(next).length > 0 ? next : undefined;
}

export function resolveFormAfterSubmit(
  settings: unknown,
  completionField: AfterSubmitSource | null,
): ResolvedAfterSubmit {
  if (hasAfterSubmitSettings(settings)) {
    const stored = parseAfterSubmit(settings);
    return {
      title: stored.title || DEFAULT_AFTER_SUBMIT_TITLE,
      messageHtml: stored.message || null,
      fallbackText: stored.message ? null : DEFAULT_AFTER_SUBMIT_TEXT,
      redirectUrl: stored.redirectUrl || null,
    };
  }

  const inherited = afterSubmitFromCompletion(completionField);
  return {
    title: inherited?.title || DEFAULT_AFTER_SUBMIT_TITLE,
    messageHtml: inherited?.message || null,
    fallbackText: inherited?.message ? null : DEFAULT_AFTER_SUBMIT_TEXT,
    redirectUrl: inherited?.redirectUrl || null,
  };
}
