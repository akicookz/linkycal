import type { CSSProperties, ReactNode, Ref } from "react";

import {
  experienceThemeStyle,
  type ExperienceThemeSurface,
  type FormExperienceTheme,
} from "@/lib/experience-theme";
import {
  EMPTY_CHROME,
  publicRootProps,
  type PublicChrome,
} from "../../shared/public-chrome";

interface ExperienceThemeRootProps {
  theme?: FormExperienceTheme;
  compiledCss?: string | null;
  chrome?: PublicChrome;
  surface?: ExperienceThemeSurface;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  ref?: Ref<HTMLDivElement>;
}

export function ExperienceThemeRoot(
  props: ExperienceThemeRootProps,
): ReactNode {
  const {
    theme,
    compiledCss,
    chrome = EMPTY_CHROME,
    surface = "inherit",
    className,
    style,
    children,
    ref,
  } = props;

  return (
    <div
      ref={ref}
      className={className}
      style={{ ...experienceThemeStyle(theme, surface), ...style }}
      {...publicRootProps(chrome)}
    >
      {compiledCss ? <style>{compiledCss}</style> : null}
      {children}
    </div>
  );
}
