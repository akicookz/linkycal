// ─── Section display settings ────────────────────────────────────────────────
//
// Stored in the form_steps.settings JSON column — no schema migration needed.

import type { CSSProperties } from "react";

export function sectionShowsFieldsTogether(settings: unknown): boolean {
  if (!settings || typeof settings !== "object") return false;
  return (settings as { groupFields?: unknown }).groupFields === true;
}

// ─── Section images ──────────────────────────────────────────────────────────
//
// A section can carry one image laid out beside or above its content. The crop
// is non-destructive: we keep the uploaded URL and store a focal point + zoom,
// applied at render time with object-position + transform. No server-side image
// processing, fully re-editable.

export type SectionImageLayout = "left" | "right" | "top";

export interface SectionImage {
  url: string;
  layout: SectionImageLayout;
  scale: number; // zoom; 1 = cover-fit, >1 zooms toward the focal point
  focusX: number; // 0–100, object-position X %
  focusY: number; // 0–100, object-position Y %
}

function clampPct(n: number): number {
  if (!Number.isFinite(n)) return 50;
  if (n < 0) return 0;
  if (n > 100) return 100;
  return n;
}

export function getSectionImage(settings: unknown): SectionImage | null {
  if (!settings || typeof settings !== "object") return null;
  const raw = (settings as { image?: unknown }).image;
  if (!raw || typeof raw !== "object") return null;
  const { url, layout, scale, focusX, focusY } = raw as Record<string, unknown>;
  if (typeof url !== "string" || url.length === 0) return null;
  return {
    url,
    layout:
      layout === "left" || layout === "right" || layout === "top"
        ? layout
        : "left",
    scale: typeof scale === "number" && scale >= 1 ? scale : 1,
    focusX: typeof focusX === "number" ? clampPct(focusX) : 50,
    focusY: typeof focusY === "number" ? clampPct(focusY) : 50,
  };
}

// Render style for an <img> that should fill its container while honoring the
// stored focal point + zoom.
export function sectionImageStyle(
  img: Pick<SectionImage, "scale" | "focusX" | "focusY">,
): CSSProperties {
  const focus = `${clampPct(img.focusX)}% ${clampPct(img.focusY)}%`;
  return {
    objectFit: "cover",
    objectPosition: focus,
    transform: img.scale && img.scale !== 1 ? `scale(${img.scale})` : undefined,
    transformOrigin: focus,
  };
}
