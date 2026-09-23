interface IllustrationProps {
  size?: number
  className?: string
}

/** A prominent, locally-bundled bed graphic (Live ER spec §8) — the primary visual object on a placement card, not a tiny corner icon. */
export function BedIllustration({ size = 40, className }: IllustrationProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" className={className} aria-hidden="true">
      <rect x="4" y="14" width="32" height="14" rx="3" fill="currentColor" opacity="0.14" />
      <path d="M6 28v4M34 28v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M4 24h32" stroke="currentColor" strokeWidth="2" />
      <rect x="6" y="16" width="10" height="6" rx="1.5" fill="currentColor" opacity="0.5" />
      <path d="M4 24v-7a2 2 0 0 1 2-2h1a2 2 0 0 1 2 2v7" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  )
}
