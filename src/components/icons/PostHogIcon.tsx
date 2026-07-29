interface PostHogIconProps {
  className?: string;
}

export function PostHogIcon({ className }: PostHogIconProps) {
  return (
    <svg
      role="img"
      aria-label="PostHog"
      viewBox="0 0 24 24"
      className={className}
    >
      <path
        d="M4 7.5 8.2 3l2.2 3.1A8 8 0 0 1 20 14c0 4.4-3.6 8-8 8s-8-3.6-8-8V7.5Z"
        fill="#F9BD2B"
      />
      <path
        d="m8.2 3 .6 4.2M4 7.5l4.8-.3M16.2 8.1 20 5.8l-.5 4.6"
        fill="none"
        stroke="#111111"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="9.5" cy="13" r="1.2" fill="#111111" />
      <circle cx="15.3" cy="13" r="1.2" fill="#111111" />
      <path
        d="M10 17c1.2 1 2.8 1 4 0"
        fill="none"
        stroke="#111111"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
