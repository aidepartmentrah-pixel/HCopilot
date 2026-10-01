interface IllustrationProps {
  /** Rendered width in px; height follows the 72:52 aspect ratio. */
  width?: number
  className?: string
}

/** Pillow, mattress and frame bed graphic (Live ER spec §8) — colored entirely through `currentColor` so the card's status tone drives it. */
export function BedIllustration({ width = 72, className }: IllustrationProps) {
  return (
    <svg
      width={width}
      height={(width * 52) / 72}
      viewBox="0 0 72 52"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <rect x="11" y="1" width="50" height="22" rx="6" fill="currentColor" opacity="0.18" stroke="currentColor" strokeWidth="2" />
      <rect x="3" y="16" width="66" height="20" rx="4" fill="currentColor" opacity="0.28" stroke="currentColor" strokeWidth="2" />
      <rect x="0" y="35" width="72" height="9" rx="2" fill="currentColor" />
      <path d="M6 44v6M66 44v6" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}
