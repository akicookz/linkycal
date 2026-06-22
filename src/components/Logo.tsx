interface LogoProps {
  size?: "sm" | "md" | "lg";
  iconOnly?: boolean;
  variant?: "dark" | "light";
}

const logoSizes = {
  sm: { icon: 28, font: 22, gap: 8 },
  md: { icon: 40, font: 32, gap: 10 },
  lg: { icon: 52, font: 42, gap: 12 },
} as const;

function Logo({ size = "md", iconOnly = false, variant = "dark" }: LogoProps) {
  const config = logoSizes[size];
  const iconSrc =
    variant === "light"
      ? "/brand/linkycal-icon-white.svg"
      : "/brand/linkycal-icon.svg";
  const linkyColor = variant === "light" ? "#FFFFFF" : "#0E1A14";
  const calColor = variant === "light" ? "#FFFFFF" : "#1C4332";

  if (iconOnly) {
    return (
      <img
        src={iconSrc}
        alt="LinkyCal"
        width={config.icon}
        height={config.icon}
        className="inline-block shrink-0"
      />
    );
  }

  return (
    <span
      className="inline-flex items-center align-middle"
      style={{ gap: config.gap }}
      role="img"
      aria-label="LinkyCal"
    >
      <img
        src={iconSrc}
        alt=""
        width={config.icon}
        height={config.icon}
        className="inline-block shrink-0"
        aria-hidden="true"
      />
      <span
        aria-hidden="true"
        className="font-extrabold leading-none"
        style={{
          color: linkyColor,
          fontFamily:
            "'Hanken Grotesk', Satoshi, -apple-system, BlinkMacSystemFont, sans-serif",
          fontSize: config.font,
          fontWeight: 800,
          letterSpacing: 0,
        }}
      >
        Linky<span style={{ color: calColor }}>Cal</span>
      </span>
    </span>
  );
}

export { Logo };
