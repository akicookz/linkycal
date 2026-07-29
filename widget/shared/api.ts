declare const __LINKYCAL_API_BASE__: string;

import type { FunnelType } from "../../shared/funnel-analytics";
import {
  analyticsJourneyStorageKey,
  isAnalyticsJourneyId,
} from "../../shared/funnel-analytics";

export function getApiBase(): string {
  return __LINKYCAL_API_BASE__;
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
