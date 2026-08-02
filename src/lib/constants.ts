import { PLAN_CATALOG, PLAN_ORDER } from "../../shared/plan-catalog";

// ─── Shared Constants ─────────────────────────────────────────────────────────

// ─── Timezones ────────────────────────────────────────────────────────────────

const baseTimezones = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Toronto",
  "America/Vancouver",
  "America/Sao_Paulo",
  "America/Argentina/Buenos_Aires",
  "America/Mexico_City",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Amsterdam",
  "Europe/Madrid",
  "Europe/Rome",
  "Europe/Stockholm",
  "Europe/Zurich",
  "Europe/Moscow",
  "Europe/Istanbul",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Asia/Hong_Kong",
  "Asia/Singapore",
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Karachi",
  "Asia/Dhaka",
  "Asia/Bangkok",
  "Asia/Seoul",
  "Asia/Jakarta",
  "Australia/Sydney",
  "Australia/Melbourne",
  "Australia/Perth",
  "Pacific/Auckland",
  "Africa/Cairo",
  "Africa/Lagos",
  "Africa/Johannesburg",
  "UTC",
];

export function getTimezones(): string[] {
  const detected = getDetectedTimezone();
  if (baseTimezones.includes(detected)) return baseTimezones;
  return [detected, ...baseTimezones];
}

export function getDetectedTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";
  } catch {
    return "America/New_York";
  }
}

// ─── Font Options ─────────────────────────────────────────────────────────────

export const FONT_OPTIONS = [
  { value: "Satoshi", label: "Satoshi", url: "https://api.fontshare.com/v2/css?f[]=satoshi@400,500,600,700&display=swap" },
  { value: "Inter", label: "Inter", url: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" },
  { value: "DM Sans", label: "DM Sans", url: "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" },
  { value: "Plus Jakarta Sans", label: "Plus Jakarta Sans", url: "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" },
  { value: "Manrope", label: "Manrope", url: "https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&display=swap" },
  { value: "Space Grotesk", label: "Space Grotesk", url: "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap" },
  { value: "Outfit", label: "Outfit", url: "https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap" },
  { value: "Poppins", label: "Poppins", url: "https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap" },
  { value: "Nunito", label: "Nunito", url: "https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700&display=swap" },
  { value: "Sora", label: "Sora", url: "https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700&display=swap" },
  { value: "Lora", label: "Lora (Serif)", url: "https://fonts.googleapis.com/css2?family=Lora:wght@400;500;600;700&display=swap" },
  { value: "JetBrains Mono", label: "JetBrains Mono", url: "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap" },
];

// ─── Plan Definitions ─────────────────────────────────────────────────────────

export interface PlanDefinition {
  id: string;
  name: string;
  price: number;
  annualPrice: number;
  interval: string;
  description: string;
  popular?: boolean;
  features: string[];
  limits: string[];
}

export const plans: PlanDefinition[] = PLAN_ORDER.map(function planDefinition(id) {
  const plan = PLAN_CATALOG[id];
  const entitlement = plan.entitlements;
  return {
    id,
    name: plan.name,
    price: plan.prices.monthly,
    annualPrice: plan.prices.annualMonthly,
    interval: id === "free" ? "forever" : "month",
    description: plan.description,
    popular: plan.highlighted,
    features: [
      `${formatLimit(entitlement.projects.limit)} projects`,
      `${formatLimit(entitlement.forms.limit)} forms per project`,
      `${formatLimit(entitlement.eventTypes.limit)} event types per project`,
      `${formatLimit(entitlement.contacts.limit)} contacts per project`,
      `${formatLimit(entitlement.formResponses.limit)} responses per month`,
      "Unlimited bookings",
      "REST API and MCP access",
      "Widgets and theme overrides",
      ...(entitlement.customCss.enabled
        ? ["Custom CSS and branding removal"]
        : []),
      ...(entitlement.analytics.enabled
        ? [`Analytics with ${entitlement.analyticsRetentionMonths.limit}-month history`]
        : []),
    ],
    limits: [
      ...(!entitlement.teamMembers.enabled ? ["Team members not included"] : []),
      ...(!entitlement.customCss.enabled ? ["Custom CSS not included"] : []),
      ...(!entitlement.analytics.enabled ? ["Analytics not included"] : []),
    ],
  };
});

function formatLimit(limit: number | null): string {
  return limit === null ? "Unlimited" : limit.toLocaleString("en-US");
}

// ─── Form Field Defaults ──────────────────────────────────────────────────────

export const FIELD_TYPE_PLACEHOLDERS: Record<string, string | null> = {
  text: "Start typing...",
  textarea: "Start typing...",
  email: "name@example.com",
  phone: "+1 (555) 000-0000",
  number: "0",
  date: "Select a date",
  time: "Select a time",
  select: "Select an option",
  multi_select: "Select options",
  radio: null,
  checkbox: null,
  rating: null,
  file: "Choose a file",
};

export function normalizeToFieldId(label: string): string {
  return (
    label
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .replace(/\s+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 50) || "field"
  );
}
