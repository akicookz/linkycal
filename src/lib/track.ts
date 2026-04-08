// ─── Client-side Analytics Tracking ──────────────────────────────────────────
//
// Sends lightweight tracking events to POST /api/v1/t via navigator.sendBeacon.
// Automatically extracts UTM params from the current URL.

function getUtmsFromUrl(): Record<string, string> {
  const params = new URLSearchParams(window.location.search);
  const utms: Record<string, string> = {};
  const keys = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"];
  for (const key of keys) {
    const val = params.get(key);
    if (val) {
      // Convert utm_source -> utmSource
      const camel = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
      utms[camel] = val;
    }
  }
  return utms;
}

function getCustomParams(): Record<string, string> | undefined {
  const params = new URLSearchParams(window.location.search);
  const custom: Record<string, string> = {};
  const utmKeys = new Set(["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "date"]);

  for (const [key, val] of params.entries()) {
    if (!utmKeys.has(key) && val) {
      custom[key] = val;
    }
  }

  return Object.keys(custom).length > 0 ? custom : undefined;
}

export function track(
  event: string,
  data: Record<string, string | undefined>,
): void {
  try {
    const utms = getUtmsFromUrl();
    const customParams = getCustomParams();
    const payload = JSON.stringify({
      event,
      source: "direct" as const,
      referrer: document.referrer || undefined,
      ...utms,
      ...data,
      ...(customParams ? { params: customParams } : {}),
    });

    if (navigator.sendBeacon) {
      navigator.sendBeacon(
        "/api/v1/t",
        new Blob([payload], { type: "application/json" }),
      );
    } else {
      fetch("/api/v1/t", {
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
