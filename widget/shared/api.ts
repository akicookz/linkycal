declare const __LINKYCAL_API_BASE__: string;

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

// ─── Tracking ────────────────────────────────────────────────────────────────

function getUtmsFromUrl(): Record<string, string> {
  try {
    const params = new URLSearchParams(window.location.search);
    const utms: Record<string, string> = {};
    const keys = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"];
    for (const key of keys) {
      const val = params.get(key);
      if (val) {
        const camel = key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
        utms[camel] = val;
      }
    }
    return utms;
  } catch {
    return {};
  }
}

export function track(
  event: string,
  data: Record<string, string | undefined>,
  explicitUtms?: Record<string, string>,
): void {
  try {
    const utms = explicitUtms ?? getUtmsFromUrl();
    const payload = JSON.stringify({
      event,
      source: "widget" as const,
      referrer: document.referrer || undefined,
      ...utms,
      ...data,
    });
    const base = getApiBase();
    if (navigator.sendBeacon) {
      navigator.sendBeacon(
        `${base}/api/v1/t`,
        new Blob([payload], { type: "application/json" }),
      );
    } else {
      fetch(`${base}/api/v1/t`, {
        method: "POST",
        body: payload,
        keepalive: true,
        headers: { "Content-Type": "application/json" },
      }).catch(() => {});
    }
  } catch {
    // Tracking must never throw
  }
}

