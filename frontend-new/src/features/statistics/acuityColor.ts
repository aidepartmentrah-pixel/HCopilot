import { ACUITY_TONE } from '@/features/isbar/constants'

/** Maps an ESI level to its status color CSS var — 'neutral' has no dedicated `--neutral` token, so it falls back to `--slate-500`. */
export function acuityBarColor(level: number): string {
  const tone = ACUITY_TONE[level] ?? 'neutral'
  return tone === 'neutral' ? 'var(--slate-500)' : `var(--${tone})`
}
