import type {
  AnalyticsDeviceType,
  AnalyticsIntegrationConfig,
  AnalyticsSource,
  CanonicalFunnelEvent,
  FunnelType,
} from "../../shared/funnel-analytics";
import {
  analyticsJourneyStorageKey,
  isAnalyticsJourneyId,
} from "../../shared/funnel-analytics";
import { dispatchAnalyticsProviders } from "./analytics-providers";

export type FunnelAnalyticsEventInput = Omit<
  CanonicalFunnelEvent,
  | "projectSlug"
  | "resourceSlug"
  | "journeyId"
  | "funnelType"
  | "source"
  | "deviceType"
  | "utmSource"
  | "utmMedium"
  | "utmCampaign"
  | "utmTerm"
  | "utmContent"
  | "referrer"
>;

export interface FunnelAnalyticsDispatcher {
  readonly journeyId: string;
  readonly source: AnalyticsSource;
  readonly deviceType: AnalyticsDeviceType;
  emit(event: FunnelAnalyticsEventInput): void;
  emitProviderOnly(event: FunnelAnalyticsEventInput): void;
}

export interface DeviceDetectionInput {
  viewportWidth: number;
  userAgent: string;
  coarsePointer: boolean;
}

export interface FunnelAnalyticsDependencies {
  storage?: Storage;
  randomUUID?: () => string;
  viewportWidth?: number;
  userAgent?: string;
  coarsePointer?: boolean;
  send?: (event: CanonicalFunnelEvent) => void;
  dispatchProviders?: (
    event: CanonicalFunnelEvent,
    integrations: AnalyticsIntegrationConfig[],
  ) => void;
}

export interface CreateFunnelAnalyticsDispatcherInput {
  projectSlug: string;
  resourceSlug: string;
  funnelType: FunnelType;
  integrations?: AnalyticsIntegrationConfig[];
  search?: string;
  referrer?: string;
}

const DEDUPED_EVENTS = new Set<CanonicalFunnelEvent["event"]>([
  "page_view",
  "booking_details_viewed",
  "booking_created",
  "form_view",
  "form_started",
  "form_stage_viewed",
  "form_stage_completed",
  "form_completed",
]);

export function detectAnalyticsDeviceType(
  input: DeviceDetectionInput,
): AnalyticsDeviceType {
  if (
    input.viewportWidth <= 767 ||
    /iphone|ipod|android.+mobile|windows phone/i.test(input.userAgent)
  ) {
    return "mobile";
  }
  if (
    input.viewportWidth <= 1024 ||
    /ipad|tablet|android/i.test(input.userAgent) ||
    (input.coarsePointer && input.viewportWidth <= 1366)
  ) {
    return "tablet";
  }
  return "desktop";
}

function defaultStorage(): Storage | undefined {
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
}

function getJourneyId(
  input: CreateFunnelAnalyticsDispatcherInput,
  params: URLSearchParams,
  dependencies: FunnelAnalyticsDependencies,
): string {
  const storage = dependencies.storage ?? defaultStorage();
  const key = analyticsJourneyStorageKey(input);
  const explicit = params.get("lc_journey");
  if (isAnalyticsJourneyId(explicit)) {
    try {
      storage?.setItem(key, explicit);
    } catch {
      // Storage is optional.
    }
    return explicit;
  }

  try {
    const stored = storage?.getItem(key);
    if (isAnalyticsJourneyId(stored)) return stored;
  } catch {
    // Storage is optional.
  }

  const generated = dependencies.randomUUID?.() ?? crypto.randomUUID();
  if (!isAnalyticsJourneyId(generated)) {
    throw new Error("Analytics journey generator returned an invalid UUID");
  }
  try {
    storage?.setItem(key, generated);
  } catch {
    // Storage is optional.
  }
  return generated;
}

function getSource(params: URLSearchParams): AnalyticsSource {
  return params.get("lc_source") === "widget" ? "widget" : "direct";
}

function getUtms(params: URLSearchParams): Partial<CanonicalFunnelEvent> {
  const mappings = [
    ["utm_source", "utmSource"],
    ["utm_medium", "utmMedium"],
    ["utm_campaign", "utmCampaign"],
    ["utm_term", "utmTerm"],
    ["utm_content", "utmContent"],
  ] as const;
  const result: Partial<CanonicalFunnelEvent> = {};
  for (const [queryKey, eventKey] of mappings) {
    const value = params.get(queryKey);
    if (value) result[eventKey] = value.slice(0, 200);
  }
  return result;
}

function sendToLinkyCal(event: CanonicalFunnelEvent): void {
  const payload = JSON.stringify(event);
  try {
    if (
      navigator.sendBeacon?.(
        "/api/v1/t",
        new Blob([payload], { type: "application/json" }),
      )
    ) {
      return;
    }
  } catch {
    // Fall through to the bounded keepalive request.
  }
  try {
    void fetch("/api/v1/t", {
      method: "POST",
      body: payload,
      keepalive: true,
      headers: { "Content-Type": "application/json" },
    }).catch(function ignoreTrackingFailure() {});
  } catch {
    // Tracking is best effort.
  }
}

function shouldDedupe(event: CanonicalFunnelEvent): boolean {
  return DEDUPED_EVENTS.has(event.event);
}

export function createFunnelAnalyticsDispatcher(
  input: CreateFunnelAnalyticsDispatcherInput,
  dependencies: FunnelAnalyticsDependencies = {},
): FunnelAnalyticsDispatcher {
  const params = new URLSearchParams(
    input.search ?? (typeof window === "undefined"
      ? ""
      : window.location.search),
  );
  const journeyId = getJourneyId(input, params, dependencies);
  const source = getSource(params);
  const deviceType = detectAnalyticsDeviceType({
    viewportWidth: dependencies.viewportWidth ??
      (typeof window === "undefined" ? 1440 : window.innerWidth),
    userAgent: dependencies.userAgent ??
      (typeof navigator === "undefined" ? "" : navigator.userAgent),
    coarsePointer: dependencies.coarsePointer ??
      (typeof window === "undefined"
        ? false
        : window.matchMedia?.("(pointer: coarse)").matches === true),
  });
  const attribution = getUtms(params);
  const referrer = (
    input.referrer ??
    (typeof document === "undefined" ? "" : document.referrer)
  ).slice(0, 2000);
  const integrations = input.integrations ?? [];
  const sent = new Set<string>();
  const providerSent = new Set<string>();
  const send = dependencies.send ?? sendToLinkyCal;
  const dispatchProviders =
    dependencies.dispatchProviders ?? dispatchAnalyticsProviders;

  function buildEvent(
    eventInput: FunnelAnalyticsEventInput,
  ): CanonicalFunnelEvent {
    return {
        ...eventInput,
        ...attribution,
        event: eventInput.event,
        projectSlug: input.projectSlug,
        resourceSlug: input.resourceSlug,
        journeyId,
        funnelType: input.funnelType,
        source,
        deviceType,
        ...(referrer ? { referrer } : {}),
      };
  }

  function providerDedupeKey(event: CanonicalFunnelEvent): string {
    return [
      journeyId,
      event.event,
      event.stageKey ?? "",
    ].join(":");
  }

  function dispatchToProvidersOnce(event: CanonicalFunnelEvent): void {
    const key = providerDedupeKey(event);
    if (shouldDedupe(event) && providerSent.has(key)) return;
    if (shouldDedupe(event)) providerSent.add(key);
    try {
      dispatchProviders(event, integrations);
    } catch {
      // Customer telemetry is isolated from LinkyCal and the public flow.
    }
  }

  return {
    journeyId,
    source,
    deviceType,
    emit: function emit(eventInput) {
      const event = buildEvent(eventInput);
      const dedupeKey = [
        journeyId,
        event.event,
        event.stageKey ?? "",
      ].join(":");
      if (shouldDedupe(event) && sent.has(dedupeKey)) return;
      if (shouldDedupe(event)) sent.add(dedupeKey);

      try {
        send(event);
      } catch {
        // LinkyCal telemetry is observational.
      }
      dispatchToProvidersOnce(event);
    },
    emitProviderOnly: function emitProviderOnly(eventInput) {
      dispatchToProvidersOnce(buildEvent(eventInput));
    },
  };
}
