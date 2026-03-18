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
  interval: string;
  description: string;
  popular?: boolean;
  features: string[];
  limits: string[];
}

export const plans: PlanDefinition[] = [
  {
    id: "free",
    name: "Free",
    price: 0,
    interval: "forever",
    description: "For getting started",
    features: [
      "1 project",
      "3 forms per project",
      "3 event types",
      "100 contacts per project",
      "1 workflow",
      "1 calendar connection",
      "Community support",
    ],
    limits: [
      "No API access",
      "No custom widgets",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: 29,
    interval: "month",
    description: "For growing businesses",
    popular: true,
    features: [
      "5 projects",
      "20 forms per project",
      "20 event types",
      "5,000 contacts per project",
      "10 workflows",
      "Google Calendar sync",
      "Full API access",
      "Priority support",
    ],
    limits: [
      "No custom widgets",
    ],
  },
  {
    id: "business",
    name: "Business",
    price: 99,
    interval: "month",
    description: "For teams and agencies",
    features: [
      "20 projects",
      "Unlimited forms",
      "Unlimited event types",
      "Unlimited contacts",
      "Unlimited workflows",
      "Google Calendar sync",
      "Full API access",
      "Custom embeddable widgets",
      "Dedicated support",
    ],
    limits: [],
  },
];
