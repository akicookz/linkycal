import type { CSSProperties } from "react";

import { deriveThemePalette } from "../../shared/theme-palette";

export interface FormExperienceTheme {
  primaryBg?: string;
  primaryText?: string;
  backgroundColor?: string;
  textColor?: string;
  borderRadius?: number;
  fontFamily?: string;
  backgroundImage?: string;
  bannerImage?: string;
}

export type ExperienceThemeSurface = "page" | "embed" | "inherit";

function cssVars(
  entries: Array<[string, string | undefined]>,
): CSSProperties {
  const vars: Record<string, string> = {};
  for (const [name, value] of entries) {
    if (value != null && value !== "") vars[name] = value;
  }
  return vars as CSSProperties;
}

export function experienceThemeVars(
  theme?: FormExperienceTheme,
): CSSProperties {
  if (!theme) return {};

  const primaryBg = theme.primaryBg;
  const radius =
    theme.borderRadius != null ? `${theme.borderRadius}px` : undefined;
  const palette = deriveThemePalette({
    background: theme.backgroundColor,
    text: theme.textColor,
    primary: theme.primaryBg,
    primaryText: theme.primaryText,
  });

  const entries: Array<[string, string | undefined]> = [
    ["--primary", primaryBg],
    ["--primary-foreground", primaryBg ? theme.primaryText || "#ffffff" : theme.primaryText],
    ["--ring", primaryBg],
    ["--brand", primaryBg],
    [
      "--brand-dark",
      primaryBg
        ? `color-mix(in srgb, ${primaryBg} 82%, black)`
        : undefined,
    ],
    [
      "--brand-soft",
      primaryBg
        ? `color-mix(in srgb, ${primaryBg} 72%, white)`
        : undefined,
    ],
    ["--radius", radius],
    ["--radius-sm", radius ? `max(0px, calc(${radius} - 4px))` : undefined],
    ["--radius-md", radius ? `max(0px, calc(${radius} - 2px))` : undefined],
    ["--radius-lg", radius],
    ["--radius-xl", radius ? `calc(${radius} + 4px)` : undefined],
  ];

  if (palette) {
    entries.push(
      ["--background", palette.background],
      ["--foreground", palette.foreground],
      ["--card", palette.card],
      ["--card-foreground", palette.foreground],
      ["--muted", palette.muted],
      ["--muted-foreground", palette.mutedForeground],
      ["--placeholder", palette.placeholder],
      ["--field-fill", palette.fieldFill],
      ["--border", palette.border],
      ["--input", palette.input],
      ["--ring-shadow-color", palette.border],
    );
    if (palette.selected != null) {
      entries.push(["--selected", palette.selected]);
    }
    if (palette.selectedForeground != null) {
      entries.push(["--selected-foreground", palette.selectedForeground]);
    }
  }

  return cssVars(entries);
}

export function experienceThemeStyle(
  theme?: FormExperienceTheme,
  surface: ExperienceThemeSurface = "page",
): CSSProperties {
  const vars = experienceThemeVars(theme);
  if (surface === "inherit") return vars;

  const text: CSSProperties = {
    ...vars,
    ...(theme?.textColor ? { color: theme.textColor } : {}),
    ...(theme?.fontFamily
      ? { fontFamily: `"${theme.fontFamily}", sans-serif` }
      : {}),
  };
  if (surface === "embed") return text;

  return {
    ...text,
    ...(theme?.backgroundColor
      ? { backgroundColor: theme.backgroundColor }
      : {}),
    ...(theme?.backgroundImage
      ? {
          backgroundImage: `url(${theme.backgroundImage})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        }
      : {}),
  };
}
