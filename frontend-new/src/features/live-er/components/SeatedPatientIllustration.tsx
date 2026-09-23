interface IllustrationProps {
  size?: number
  className?: string
}

/** A professional seated-patient graphic (Live ER spec §14) — never emoji for a waiting/no-bed card. */
export function SeatedPatientIllustration({ size = 40, className }: IllustrationProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" className={className} aria-hidden="true">
      <circle cx="20" cy="10" r="4.5" fill="currentColor" opacity="0.6" />
      <path
        d="M13 26v-4a7 7 0 0 1 14 0v4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        fill="currentColor"
        fillOpacity="0.14"
      />
      <path d="M9 30h22M13 26v6M27 26v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M9 30v-6a2 2 0 0 1 2-2M31 30v-6a2 2 0 0 0-2-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
