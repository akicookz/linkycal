import posthog from "posthog-js";
import type { PostHog } from "posthog-js";

import type {
  AnalyticsIntegrationConfig,
  CanonicalFunnelEvent,
} from "../../shared/funnel-analytics";

export type ExternalAnalyticsProperty =
  | string
  | number
  | boolean
  | string[];

export interface ExternalAnalyticsDispatch {
  provider: "ga4" | "meta_pixel" | "posthog";
  eventName: string;
  properties: Record<string, ExternalAnalyticsProperty>;
  config: AnalyticsIntegrationConfig;
  standardMetaEvent?: boolean;
}

function addProperty(
  properties: Record<string, ExternalAnalyticsProperty>,
  key: string,
  value: ExternalAnalyticsProperty | undefined,
): void {
  if (value === undefined || value === "") return;
  properties[key] = value;
}

function buildSafeProperties(
  event: CanonicalFunnelEvent,
): Record<string, ExternalAnalyticsProperty> {
  const properties: Record<string, ExternalAnalyticsProperty> = {};
  addProperty(properties, "resource_slug", event.resourceSlug);
  addProperty(properties, "funnel_type", event.funnelType);
  addProperty(properties, "stage_key", event.stageKey);
  addProperty(properties, "stage_order", event.stageOrder);
  addProperty(properties, "stage_kind", event.stageKind);
  addProperty(properties, "source", event.source);
  addProperty(properties, "device_type", event.deviceType);
  addProperty(properties, "slot_count", event.slotCount);
  addProperty(properties, "days_ahead", event.daysAhead);
  addProperty(properties, "duration_minutes", event.durationMinutes);

  const context = event.context;
  addProperty(
    properties,
    "selected_date_utc",
    context?.selectedDateUtc,
  );

  addProperty(properties, "utm_source", event.utmSource);
  addProperty(properties, "utm_medium", event.utmMedium);
  addProperty(properties, "utm_campaign", event.utmCampaign);
  addProperty(properties, "utm_term", event.utmTerm);
  addProperty(properties, "utm_content", event.utmContent);
  return properties;
}

function metaEventName(event: CanonicalFunnelEvent): {
  name: string;
  standard: boolean;
} {
  if (event.event === "booking_created") {
    return { name: "Schedule", standard: true };
  }
  if (event.event === "form_completed") {
    return { name: "Lead", standard: true };
  }
  return { name: `LinkyCal_${event.event}`, standard: false };
}

export function buildExternalAnalyticsDispatches(
  event: CanonicalFunnelEvent,
  integrations: AnalyticsIntegrationConfig[],
): ExternalAnalyticsDispatch[] {
  const properties = buildSafeProperties(event);
  const dispatches: ExternalAnalyticsDispatch[] = [];

  for (const config of integrations) {
    if (!config.enabled) continue;
    if (config.provider === "ga4" && config.measurementId) {
      dispatches.push({
        provider: "ga4",
        eventName: `linkycal_${event.event}`,
        properties,
        config,
      });
      continue;
    }
    if (config.provider === "meta_pixel" && config.pixelId) {
      const mapped = metaEventName(event);
      dispatches.push({
        provider: "meta_pixel",
        eventName: mapped.name,
        properties,
        config,
        standardMetaEvent: mapped.standard,
      });
      continue;
    }
    if (config.provider === "posthog" && config.projectKey) {
      dispatches.push({
        provider: "posthog",
        eventName: event.event,
        properties,
        config,
      });
    }
  }

  return dispatches;
}

interface AnalyticsWindow extends Window {
  dataLayer?: unknown[][];
  fbq?: {
    (...args: unknown[]): void;
    queue?: unknown[][];
    loaded?: boolean;
    version?: string;
  };
}

const initializedGa4Ids = new Set<string>();
const initializedMetaPixelIds = new Set<string>();
let customerPostHog: PostHog | null = null;
let customerPostHogKey: string | null = null;

function appendScriptOnce(id: string, src: string): void {
  if (document.getElementById(id)) return;
  const script = document.createElement("script");
  script.id = id;
  script.async = true;
  script.src = src;
  document.head.appendChild(script);
}

function dispatchGa4(dispatch: ExternalAnalyticsDispatch): void {
  if (
    dispatch.config.provider !== "ga4" ||
    !dispatch.config.measurementId
  ) {
    return;
  }
  const analyticsWindow = window as AnalyticsWindow;
  analyticsWindow.dataLayer ??= [];
  const gtag = function gtag(...args: unknown[]) {
    analyticsWindow.dataLayer!.push(args);
  };
  if (!initializedGa4Ids.has(dispatch.config.measurementId)) {
    appendScriptOnce(
      `linkycal-ga4-${dispatch.config.measurementId}`,
      `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(dispatch.config.measurementId)}`,
    );
    gtag("js", new Date());
    gtag("config", dispatch.config.measurementId);
    initializedGa4Ids.add(dispatch.config.measurementId);
  }
  gtag("event", dispatch.eventName, dispatch.properties);
}

function getMetaQueue(): NonNullable<AnalyticsWindow["fbq"]> {
  const analyticsWindow = window as AnalyticsWindow;
  if (analyticsWindow.fbq) return analyticsWindow.fbq;
  const queue: unknown[][] = [];
  const fbq: NonNullable<AnalyticsWindow["fbq"]> = function fbq(
    ...args: unknown[]
  ) {
    queue.push(args);
  };
  fbq.queue = queue;
  fbq.loaded = true;
  fbq.version = "2.0";
  analyticsWindow.fbq = fbq;
  return fbq;
}

function dispatchMetaPixel(dispatch: ExternalAnalyticsDispatch): void {
  if (
    dispatch.config.provider !== "meta_pixel" ||
    !dispatch.config.pixelId
  ) {
    return;
  }
  const fbq = getMetaQueue();
  if (!initializedMetaPixelIds.has(dispatch.config.pixelId)) {
    appendScriptOnce(
      "linkycal-meta-pixel",
      "https://connect.facebook.net/en_US/fbevents.js",
    );
    fbq("init", dispatch.config.pixelId);
    initializedMetaPixelIds.add(dispatch.config.pixelId);
  }
  fbq(
    dispatch.standardMetaEvent ? "track" : "trackCustom",
    dispatch.eventName,
    dispatch.properties,
  );
}

function dispatchPostHog(dispatch: ExternalAnalyticsDispatch): void {
  if (
    dispatch.config.provider !== "posthog" ||
    !dispatch.config.projectKey
  ) {
    return;
  }
  if (
    !customerPostHog ||
    customerPostHogKey !== dispatch.config.projectKey
  ) {
    customerPostHog = posthog.init(
      dispatch.config.projectKey,
      {
        api_host: dispatch.config.host === "eu"
          ? "https://eu.i.posthog.com"
          : "https://us.i.posthog.com",
        autocapture: false,
        capture_pageview: false,
        capture_pageleave: false,
        persistence: "memory",
      },
      "linkycal_customer",
    );
    customerPostHogKey = dispatch.config.projectKey;
  }
  customerPostHog.capture(dispatch.eventName, dispatch.properties);
}

export function dispatchAnalyticsProviders(
  event: CanonicalFunnelEvent,
  integrations: AnalyticsIntegrationConfig[],
): void {
  for (const dispatch of buildExternalAnalyticsDispatches(
    event,
    integrations,
  )) {
    try {
      if (dispatch.provider === "ga4") {
        dispatchGa4(dispatch);
      } else if (dispatch.provider === "meta_pixel") {
        dispatchMetaPixel(dispatch);
      } else {
        dispatchPostHog(dispatch);
      }
    } catch {
      // A customer provider must never affect the public experience.
    }
  }
}
