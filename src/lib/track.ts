import type {
  AnalyticsEventName,
  FunnelType,
} from "../../shared/funnel-analytics";
import {
  createFunnelAnalyticsDispatcher,
  type FunnelAnalyticsDispatcher,
} from "./funnel-analytics";

const dispatchers = new Map<string, FunnelAnalyticsDispatcher>();

function getFunnelType(event: AnalyticsEventName): FunnelType {
  return event.startsWith("form_") ? "form" : "booking";
}

export function track(
  event: AnalyticsEventName,
  data: {
    projectSlug: string;
    resourceSlug?: string;
  },
): void {
  try {
    const resourceSlug = data.resourceSlug ?? data.projectSlug;
    const funnelType = getFunnelType(event);
    const key = `${data.projectSlug}:${funnelType}:${resourceSlug}`;
    let dispatcher = dispatchers.get(key);
    if (!dispatcher) {
      dispatcher = createFunnelAnalyticsDispatcher({
        projectSlug: data.projectSlug,
        resourceSlug,
        funnelType,
      });
      dispatchers.set(key, dispatcher);
    }
    dispatcher.emit({ event });
  } catch {
    // Tracking must never throw.
  }
}
