declare const __LINKYCAL_API_BASE__: string;

import type { FunnelType } from "../../shared/funnel-analytics";
import {
  analyticsJourneyStorageKey,
  isAnalyticsJourneyId,
} from "../../shared/funnel-analytics";

export function getApiBase(): string {
  return __LINKYCAL_API_BASE__;
}

const WIDGET_RESERVED_PARAMS = new Set([
  "embed",
  "theme",
  "lc_source",
  "lc_journey",
]);

export type WidgetHiddenValues = Record<
  string,
  string | number | boolean | string[] | null | undefined
>;

export function appendHostPageParams(url: URL): void {
  try {
    const params = new URLSearchParams(window.location.search);
    for (const [key, value] of params) {
      if (WIDGET_RESERVED_PARAMS.has(key)) continue;
      url.searchParams.append(key, value);
    }
  } catch {
    // Host search is optional.
  }
}

export function appendHiddenParams(
  url: URL,
  hidden?: WidgetHiddenValues,
): void {
  if (!hidden) return;
  for (const [key, value] of Object.entries(hidden)) {
    if (value == null) continue;
    if (Array.isArray(value)) {
      url.searchParams.delete(key);
      for (const item of value) {
        url.searchParams.append(key, String(item));
      }
      continue;
    }
    url.searchParams.set(key, String(value));
  }
}

// ─── Public Theme Type ───────────────────────────────────────────────────────

export interface WidgetTheme {
  primaryBg?: string;
  primaryText?: string;
  backgroundColor?: string;
  textColor?: string;
  borderRadius?: number;
  fontFamily?: string;
  backgroundImage?: string;
  bannerImage?: string;
}

// ─── Analytics handoff ───────────────────────────────────────────────────────

export interface WidgetAnalyticsParams {
  projectSlug: string;
  resourceSlug: string;
  funnelType: FunnelType;
  storage?: Storage;
  randomUUID?: () => string;
}

export function addWidgetAnalyticsParams(
  url: URL,
  input: WidgetAnalyticsParams,
): string {
  const key = analyticsJourneyStorageKey(input);
  let journeyId: string | null = null;
  const storage = input.storage ?? window.sessionStorage;
  try {
    const stored = storage.getItem(key);
    if (isAnalyticsJourneyId(stored)) journeyId = stored;
  } catch {
    // Storage is optional.
  }
  if (!journeyId) {
    const generated = input.randomUUID?.() ?? crypto.randomUUID();
    if (!isAnalyticsJourneyId(generated)) {
      throw new Error("Widget analytics journey must be a UUID");
    }
    journeyId = generated;
    try {
      storage.setItem(key, journeyId);
    } catch {
      // Storage is optional.
    }
  }

  url.searchParams.set("lc_source", "widget");
  url.searchParams.set("lc_journey", journeyId);
  return journeyId;
}
