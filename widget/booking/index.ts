import { getApiBase, track, type WidgetTheme } from "@widget/api";

interface BookingWidgetOptions {
  projectSlug: string;
  eventTypeSlug: string;
  container: string | HTMLElement;
  theme?: WidgetTheme;
  utms?: Record<string, string>;
}

function getUtmsFromUrl(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    const params = new URLSearchParams(window.location.search);
    for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"]) {
      const v = params.get(k);
      if (v) out[k] = v;
    }
  } catch { /* ignore */ }
  return out;
}

function initBookingWidget(options: BookingWidgetOptions): void {
  const { projectSlug, eventTypeSlug, theme, utms } = options;
  const root =
    typeof options.container === "string"
      ? document.querySelector<HTMLElement>(options.container)
      : options.container;

  if (!root) {
    console.error("[LinkyCal] Container not found:", options.container);
    return;
  }

  const base = getApiBase();
  const url = new URL(`${base}/${projectSlug}/${eventTypeSlug}`);
  url.searchParams.set("embed", "1");
  if (theme) {
    try {
      url.searchParams.set("theme", btoa(JSON.stringify(theme)));
    } catch { /* ignore encoding errors */ }
  }
  const allUtms = { ...getUtmsFromUrl(), ...(utms ?? {}) };
  for (const [k, v] of Object.entries(allUtms)) {
    url.searchParams.set(k, v);
  }

  const iframe = document.createElement("iframe");
  iframe.src = url.toString();
  iframe.title = "Book a meeting";
  iframe.setAttribute("allow", "clipboard-write; fullscreen");
  iframe.style.cssText =
    "width:100%;border:0;display:block;background:transparent;color-scheme:light;min-height:560px;";
  root.appendChild(iframe);

  const expectedOrigin = new URL(base).origin;
  function onMessage(e: MessageEvent) {
    if (e.origin !== expectedOrigin) return;
    if (e.source !== iframe.contentWindow) return;
    const data = e.data as { type?: string; height?: number } | undefined;
    if (data?.type === "lc-height" && typeof data.height === "number" && data.height > 0) {
      iframe.style.height = `${Math.ceil(data.height)}px`;
    }
  }
  window.addEventListener("message", onMessage);

  track("widget_view", { projectSlug, resourceSlug: eventTypeSlug }, utms);
}

(window as any).LinkyCal = (window as any).LinkyCal || {};
(window as any).LinkyCal.booking = initBookingWidget;
