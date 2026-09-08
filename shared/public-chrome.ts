export const CHROME_IDS = [
  "banner",
  "branding",
  "title",
  "intro",
  "avatar",
  "media",
] as const;

export type ChromeId = (typeof CHROME_IDS)[number];

export interface ChromeFlags {
  hideBanner?: boolean;
  hideBranding?: boolean;
  hideTitle?: boolean;
  hideIntro?: boolean;
  hideAvatar?: boolean;
  hideMedia?: boolean;
}

export interface PublicChrome {
  hidden: ReadonlySet<ChromeId>;
}

export const CHROME_QUERY_KEYS: Record<ChromeId, string> = {
  banner: "hide_banner",
  branding: "hide_branding",
  title: "hide_title",
  intro: "hide_intro",
  avatar: "hide_avatar",
  media: "hide_media",
};

export const CHROME_FLAG_KEYS: Record<ChromeId, keyof ChromeFlags> = {
  banner: "hideBanner",
  branding: "hideBranding",
  title: "hideTitle",
  intro: "hideIntro",
  avatar: "hideAvatar",
  media: "hideMedia",
};

export const CHROME_ATTR: Record<ChromeId, string> = {
  banner: "data-lc-banner",
  branding: "data-lc-branding",
  title: "data-lc-title",
  intro: "data-lc-intro",
  avatar: "data-lc-avatar",
  media: "data-lc-media",
};

export const EMPTY_CHROME: PublicChrome = { hidden: new Set() };

export const CHROME_RESERVED_PARAMS = new Set<string>(
  Object.values(CHROME_QUERY_KEYS),
);

export function isChromeHidden(chrome: PublicChrome, id: ChromeId): boolean {
  return chrome.hidden.has(id);
}

export function parseChromeFlags(raw: unknown): ChromeFlags {
  if (!raw || typeof raw !== "object") return {};
  const record = raw as Record<string, unknown>;
  const flags: ChromeFlags = {};
  for (const id of CHROME_IDS) {
    const key = CHROME_FLAG_KEYS[id];
    if (record[key] === true) flags[key] = true;
  }
  return flags;
}

export function parseChromeFromSettings(settings: unknown): ChromeFlags {
  if (!settings || typeof settings !== "object") return {};
  return parseChromeFlags((settings as { chrome?: unknown }).chrome);
}

export function compactChromeFlags(flags: ChromeFlags): ChromeFlags | undefined {
  const compact: ChromeFlags = {};
  let any = false;
  for (const id of CHROME_IDS) {
    const key = CHROME_FLAG_KEYS[id];
    if (flags[key] === true) {
      compact[key] = true;
      any = true;
    }
  }
  return any ? compact : undefined;
}

export function mergeChromeFlags(
  resource: ChromeFlags,
  override: ChromeFlags,
): ChromeFlags {
  const merged: ChromeFlags = {};
  for (const id of CHROME_IDS) {
    const key = CHROME_FLAG_KEYS[id];
    if (resource[key] === true || override[key] === true) merged[key] = true;
  }
  return merged;
}

export function chromeFlagsFromSearchParams(
  params: URLSearchParams,
): ChromeFlags {
  const flags: ChromeFlags = {};
  for (const id of CHROME_IDS) {
    if (params.get(CHROME_QUERY_KEYS[id]) === "1") {
      flags[CHROME_FLAG_KEYS[id]] = true;
    }
  }
  return flags;
}

export function appendChromeParams(url: URL, flags?: ChromeFlags): void {
  const compact = flags ? compactChromeFlags(flags) : undefined;
  if (!compact) return;
  for (const id of CHROME_IDS) {
    if (compact[CHROME_FLAG_KEYS[id]]) {
      url.searchParams.set(CHROME_QUERY_KEYS[id], "1");
    }
  }
}

export function resolvePublicChrome(input: {
  resource?: ChromeFlags;
  override?: ChromeFlags;
  canHideBranding: boolean;
}): PublicChrome {
  const merged = mergeChromeFlags(input.resource ?? {}, input.override ?? {});
  const hidden = new Set<ChromeId>();
  for (const id of CHROME_IDS) {
    if (merged[CHROME_FLAG_KEYS[id]] !== true) continue;
    if (id === "branding" && !input.canHideBranding) continue;
    hidden.add(id);
  }
  return { hidden };
}

export function resolvePublicChromeFromPage(input: {
  settings: unknown;
  search: URLSearchParams;
  canHideBranding: boolean;
}): PublicChrome {
  return resolvePublicChrome({
    resource: parseChromeFromSettings(input.settings),
    override: chromeFlagsFromSearchParams(input.search),
    canHideBranding: input.canHideBranding,
  });
}

export function chromeMarkerProps(id: ChromeId): Record<string, ""> {
  return { [CHROME_ATTR[id]]: "" };
}

export function publicRootProps(chrome: PublicChrome): {
  "data-linkycal-public": "";
  "data-lc-hide"?: string;
} {
  const hide = CHROME_IDS.filter((id) => chrome.hidden.has(id)).join(" ");
  if (!hide) return { "data-linkycal-public": "" };
  return { "data-linkycal-public": "", "data-lc-hide": hide };
}
