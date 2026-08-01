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
export type FunnelStageOutcome = (typeof FUNNEL_STAGE_OUTCOMES)[number];
export type AnalyticsProvider = (typeof ANALYTICS_PROVIDERS)[number];

export interface FunnelEventContext {
  selectedDateUtc?: string;
  fieldType?: string;
  required?: boolean;
  stageOutcome?: FunnelStageOutcome;
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
}

export interface DetailedFunnelReport {
  availableSince: string | null;
  stages: FunnelStageReport[];
  bySource: Array<{
    source: AnalyticsSource;
    visitors: number;
  }>;
  byDevice: Array<{
    deviceType: AnalyticsDeviceType;
    visitors: number;
  }>;
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

const ANALYTICS_JOURNEY_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isAnalyticsJourneyId(value: unknown): value is string {
  return typeof value === "string" &&
    ANALYTICS_JOURNEY_ID_PATTERN.test(value);
}

export function analyticsJourneyStorageKey(input: {
  projectSlug: string;
  resourceSlug: string;
  funnelType: FunnelType;
}): string {
  return [
    "linkycal",
    "analytics",
    "journey",
    input.projectSlug,
    input.funnelType,
    input.resourceSlug,
  ].join(":");
}
