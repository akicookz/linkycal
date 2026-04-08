const API_BASE = "__LINKYCAL_API_BASE__"; // replaced at build time or auto-detected

export function getApiBase(): string {
  // If replaced at build time, use that
  if (API_BASE && !API_BASE.startsWith("__")) {
    return API_BASE;
  }

  // Try to detect from script src
  const scripts = document.querySelectorAll("script[src]");
  for (const script of scripts) {
    const src = (script as HTMLScriptElement).src;
    if (src.includes("linkycal") || src.includes("widgets")) {
      try {
        const url = new URL(src);
        return url.origin;
      } catch {
        // ignore malformed URLs
      }
    }
  }

  return window.location.origin;
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

// ─── API ─────────────────────────────────────────────────────────────────────

export async function fetchApi<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const base = getApiBase();
  const res = await fetch(`${base}${path}`, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`API error: ${res.status}${body ? ` - ${body}` : ""}`);
  }
  return res.json();
}
