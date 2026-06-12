interface LogoProps {
  size?: "sm" | "md" | "lg";
  iconOnly?: boolean;
  variant?: "dark" | "light";
}

function Logo({ size = "md", iconOnly = false, variant = "dark" }: LogoProps) {
  const heightPx = { sm: 28, md: 40, lg: 52 }[size];

  const badge = (
    <>
      <rect x="8" y="8" width="64" height="64" rx="18" ry="18" fill="#1b4332" />
      {/* small calendar tabs */}
      <rect x="27" y="13" width="2.5" height="5" rx="1" fill="#a5b3a3" />
      <rect x="51" y="13" width="2.5" height="5" rx="1" fill="#a5b3a3" />
      {/* 3x3 circle grid, centered with breathing room from edges */}
      <circle cx="28" cy="30" r="3.5" fill="#a5b3a3" />
      <circle cx="40" cy="30" r="3.5" fill="#a5b3a3" />
      <circle cx="52" cy="30" r="3.5" fill="#a5b3a3" />
      <circle cx="28" cy="43" r="3.5" fill="#c8e57b" />
      <circle cx="40" cy="43" r="3.5" fill="#a5b3a3" />
      <circle cx="52" cy="43" r="3.5" fill="#a5b3a3" />
      <circle cx="28" cy="56" r="3.5" fill="#a5b3a3" />
      <circle cx="40" cy="56" r="3.5" fill="#a5b3a3" />
      <circle cx="52" cy="56" r="3.5" fill="#a5b3a3" />
      {/* link curve + end marker */}
      <path
        d="M 28 43 Q 40 65 52 56"
        stroke="#c8e57b"
        strokeWidth="1.8"
        fill="none"
        strokeLinecap="round"
      />
      <circle cx="52" cy="56" r="2" fill="#c8e57b" />
    </>
  );

  if (iconOnly) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 80 80"
        height={heightPx}
        width={heightPx}
        aria-label="LinkyCal"
      >
        {badge}
      </svg>
    );
  }

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 280 80"
      height={heightPx}
      aria-label="LinkyCal"
    >
      {badge}
      <text
        x="84"
        y="56"
        fontFamily="Satoshi, -apple-system, BlinkMacSystemFont, sans-serif"
        fontSize="40"
        fontWeight={800}
        fill={variant === "light" ? "#FFFFFF" : "#1A1A1A"}
        letterSpacing="-1.2"
      >
        LinkyCal
      </text>
    </svg>
  );
}

export { Logo };
