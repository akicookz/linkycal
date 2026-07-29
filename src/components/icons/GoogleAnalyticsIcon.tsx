interface GoogleAnalyticsIconProps {
  className?: string;
}

export function GoogleAnalyticsIcon({
  className,
}: GoogleAnalyticsIconProps) {
  return (
    <svg
      role="img"
      aria-label="Google Analytics"
      viewBox="0 0 24 24"
      className={className}
    >
      <rect x="14" y="2" width="7" height="20" rx="3.5" fill="#F9AB00" />
      <rect x="8" y="8" width="5" height="14" rx="2.5" fill="#E37400" />
      <circle cx="4.5" cy="18.5" r="3.5" fill="#E37400" />
    </svg>
  );
}
