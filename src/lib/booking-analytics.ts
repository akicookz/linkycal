import type {
  AnalyticsFailureCategory,
} from "../../shared/funnel-analytics";

export function classifyBookingFailure(
  status?: number,
  error?: unknown,
): AnalyticsFailureCategory {
  if (status === 409) return "slot_unavailable";
  if (status === 429) return "rate_limited";
  if (status !== undefined && status >= 500) return "server";
  if (status !== undefined && status >= 400 && status < 500) {
    return "validation";
  }
  if (error instanceof TypeError) return "network";
  return "unknown";
}
