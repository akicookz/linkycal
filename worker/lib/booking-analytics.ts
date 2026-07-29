import type { z } from "zod";

import { writeAnalyticsEvent } from "../services/analytics-service";
import { bookingAnalyticsCorrelationSchema } from "../validation";

export type BookingAnalyticsCorrelation = z.infer<
  typeof bookingAnalyticsCorrelationSchema
>;

interface BookingCreatedAnalyticsInput {
  projectId: string;
  resourceSlug: string;
  correlation?: BookingAnalyticsCorrelation;
  country?: string;
  city?: string;
}

export function writeBookingCreatedAnalytics(
  analytics: AnalyticsEngineDataset,
  input: BookingCreatedAnalyticsInput,
): void {
  writeAnalyticsEvent(analytics, {
    projectId: input.projectId,
    event: "booking_created",
    resourceSlug: input.resourceSlug,
    country: input.country,
    city: input.city,
    source: input.correlation?.source,
    journeyId: input.correlation?.journeyId,
    funnelType: input.correlation?.funnelType,
    deviceType: input.correlation?.deviceType,
    ...(input.correlation
      ? {
          stageKey: "booking-complete",
          stageLabel: "Booking created",
          stageKind: "completion" as const,
          stageOrder: (input.correlation.stageOrder ?? 5) + 1,
        }
      : {}),
  });
}
