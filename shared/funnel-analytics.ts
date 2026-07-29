export const EXISTING_CANONICAL_EVENT_NAMES = [
  "page_view",
  "booking_created",
  "form_view",
  "form_started",
  "form_completed",
] as const;

export const DETAILED_ANALYTICS_EVENT_NAMES = [
  "booking_date_selected",
  "booking_availability_shown",
  "booking_time_selected",
  "booking_details_viewed",
  "booking_submit_attempted",
  "booking_submit_failed",
  "form_stage_viewed",
  "form_stage_completed",
  "form_stage_skipped",
  "form_stage_validation_failed",
  "form_submit_attempted",
  "form_submit_failed",
] as const;

export const ANALYTICS_EVENT_NAMES = [
  ...EXISTING_CANONICAL_EVENT_NAMES,
  ...DETAILED_ANALYTICS_EVENT_NAMES,
] as const;

export const ANALYTICS_SOURCES = ["direct", "widget"] as const;
export const ANALYTICS_DEVICE_TYPES = [
  "mobile",
  "tablet",
  "desktop",
] as const;
export const FUNNEL_TYPES = ["booking", "form"] as const;
export const FUNNEL_STAGE_KINDS = [
  "page",
  "date",
  "availability",
  "time",
  "details",
  "statement",
  "question",
  "group",
  "step",
  "submit",
  "completion",
] as const;
export const ANALYTICS_FAILURE_CATEGORIES = [
  "validation",
  "slot_unavailable",
  "rate_limited",
  "network",
  "server",
  "unknown",
] as const;
export const FUNNEL_STAGE_OUTCOMES = [
  "viewed",
  "completed",
  "skipped",
  "validation_failed",
] as const;
export const ANALYTICS_PROVIDERS = [
  "ga4",
  "meta_pixel",
  "posthog",
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENT_NAMES)[number];
export type AnalyticsSource = (typeof ANALYTICS_SOURCES)[number];
export type AnalyticsDeviceType = (typeof ANALYTICS_DEVICE_TYPES)[number];
export type FunnelType = (typeof FUNNEL_TYPES)[number];
export type FunnelStageKind = (typeof FUNNEL_STAGE_KINDS)[number];
export type AnalyticsFailureCategory =
  (typeof ANALYTICS_FAILURE_CATEGORIES)[number];
export type FunnelStageOutcome = (typeof FUNNEL_STAGE_OUTCOMES)[number];
export type AnalyticsProvider = (typeof ANALYTICS_PROVIDERS)[number];

export interface FunnelEventContext {
  selectedDate?: string;
  weekday?: string;
  viewerTimezone?: string;
  offeredSlotStarts?: string[];
  earliestSlot?: string;
  latestSlot?: string;
  availabilityOutcome?: "available" | "none" | "error";
  selectedTime?: string;
  fieldType?: string;
  required?: boolean;
  stageOutcome?: FunnelStageOutcome;
  failureCategory?: AnalyticsFailureCategory;
}

export interface CanonicalFunnelEvent {
  event: AnalyticsEventName;
  projectSlug: string;
  resourceSlug?: string;
  journeyId?: string;
  funnelType?: FunnelType;
  stageKey?: string;
  stageLabel?: string;
  stageKind?: FunnelStageKind;
  stageOrder?: number;
  primaryValue?: string;
  deviceType?: AnalyticsDeviceType;
  source?: AnalyticsSource;
  slotCount?: number;
  daysAhead?: number;
  durationMinutes?: number;
  context?: FunnelEventContext;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
  referrer?: string;
  params?: Record<string, string>;
}

export interface FunnelContextValue {
  value: string;
  visitors: number;
}

export interface FunnelContextBreakdowns {
  selectedDates?: FunnelContextValue[];
  availabilityOutcomes?: FunnelContextValue[];
  offeredTimes?: FunnelContextValue[];
  selectedTimes?: FunnelContextValue[];
  validationFailures?: FunnelContextValue[];
  submitFailures?: FunnelContextValue[];
}

export interface FunnelStageReport {
  key: string;
  label: string;
  kind: string;
  order: number;
  visitors: number;
  continued: number;
  continuationRate: number;
  dropOffs: number;
  dropOffRate: number;
  skipped?: number;
  contextBreakdowns?: FunnelContextBreakdowns;
}

export interface Ga4AnalyticsIntegration {
  provider: "ga4";
  enabled: boolean;
  measurementId?: string;
}

export interface MetaPixelAnalyticsIntegration {
  provider: "meta_pixel";
  enabled: boolean;
  pixelId?: string;
}

export interface PostHogAnalyticsIntegration {
  provider: "posthog";
  enabled: boolean;
  projectKey?: string;
  host?: "us" | "eu";
}

export type AnalyticsIntegrationConfig =
  | Ga4AnalyticsIntegration
  | MetaPixelAnalyticsIntegration
  | PostHogAnalyticsIntegration;

export interface AnalyticsIntegrations {
  ga4: Omit<Ga4AnalyticsIntegration, "provider">;
  meta_pixel: Omit<MetaPixelAnalyticsIntegration, "provider">;
  posthog: Omit<PostHogAnalyticsIntegration, "provider">;
}

export type ConfigureAnalyticsIntegrationInput =
  AnalyticsIntegrationConfig;
