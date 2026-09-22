/**
 * HCopilot application icon (Global Theme spec §5) — an original geometric
 * mark adapted from the reference concept images (two ChatGPT-generated
 * PNGs used for layout/feel only, per this mission's standing "no GPT
 * assumption" rule: nothing here is traced from them, just the same idea —
 * a flowing "H" plus a small "+" accent on a rounded indigo tile). Bundled
 * inline as SVG so it never needs a network request (§45 air-gapped).
 */
export function HCopilotMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" role="img" aria-label="HCopilot">
      <rect width="32" height="32" rx="8" fill="url(#hcopilot-mark-gradient)" />
      <path d="M11 8v16" stroke="#ffffff" strokeWidth="4.5" strokeLinecap="round" />
      <path d="M21 8v16" stroke="#ffffff" strokeWidth="4.5" strokeLinecap="round" opacity="0.85" />
      <path
        d="M11 16c3 4 7 4 10 0"
        stroke="#ffffff"
        strokeWidth="4.5"
        strokeLinecap="round"
        fill="none"
        opacity="0.6"
      />
      <path d="M26 19v5M23.5 21.5h5" stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" />
      <defs>
        <linearGradient id="hcopilot-mark-gradient" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="#818cf8" />
          <stop offset="1" stopColor="#4338ca" />
        </linearGradient>
      </defs>
    </svg>
  )
}
