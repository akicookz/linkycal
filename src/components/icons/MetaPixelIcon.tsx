interface MetaPixelIconProps {
  className?: string;
}

export function MetaPixelIcon({ className }: MetaPixelIconProps) {
  return (
    <svg
      role="img"
      aria-label="Meta Pixel"
      viewBox="0 0 24 24"
      className={className}
      fill="none"
    >
      <path
        d="M3 15.8c0-5.3 2.1-9.6 5-9.6 2 0 3.5 2.3 5.2 5.2l1.2 2c1.5 2.5 2.4 3.7 3.6 3.7 1.5 0 2.4-1.8 2.4-5.2 0-2.9-.9-5-2.8-5-1.1 0-2.1.7-3.1 1.8"
        stroke="#0866FF"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M3 15.8c0 1.5.7 2.4 1.8 2.4 1.6 0 2.8-2.2 4.7-5.4l1-1.7"
        stroke="#0866FF"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
