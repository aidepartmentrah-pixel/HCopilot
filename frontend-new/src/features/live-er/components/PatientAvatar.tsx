import type { AvatarKind } from '../utils'

interface PatientAvatarProps {
  kind: AvatarKind
  size?: number
  className?: string
}

/**
 * Gendered, age-appropriate waiting-patient avatar (man / woman / boy / girl,
 * neutral when gender is unknown) as inline SVG — no emoji, so it renders the
 * same on every hospital workstation. Colored through `currentColor`.
 */
export function PatientAvatar({ kind, size = 48, className }: PatientAvatarProps) {
  const isChild = kind === 'boy' || kind === 'girl' || kind === 'neutral-child'
  // A child is drawn with a lower, smaller head and narrower shoulders.
  const headY = isChild ? 23 : 18
  const headR = isChild ? 6.5 : 7.5
  const body = isChild ? 'M14 46c0-6 4.5-10 10-10s10 4 10 10z' : 'M9 46c0-9 6-14 15-14s15 5 15 14z'

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={className}
      aria-hidden="true"
      data-avatar={kind}
    >
      {/* Long hair sits behind the head. */}
      {(kind === 'woman' || kind === 'girl') && (
        <path
          d={
            isChild
              ? 'M16.5 23a7.5 7.5 0 0 1 15 0v7a2.5 2.5 0 0 1-2.5 2.5h-10A2.5 2.5 0 0 1 16.5 30z'
              : 'M15.5 18a8.5 8.5 0 0 1 17 0v11a3 3 0 0 1-3 3h-11a3 3 0 0 1-3-3z'
          }
          fill="currentColor"
          opacity="0.7"
        />
      )}
      <path d={body} fill="currentColor" opacity="0.28" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx="24" cy={headY} r={headR} fill="currentColor" opacity="0.5" stroke="currentColor" strokeWidth="1.5" />
      {/* Short hair cap for a man / boy. */}
      {(kind === 'man' || kind === 'boy') && (
        <path
          d={`M${24 - headR} ${headY - 1.5}a${headR} ${headR} 0 0 1 ${headR * 2} 0z`}
          fill="currentColor"
          opacity="0.85"
        />
      )}
      {/* Pigtails for a girl. */}
      {kind === 'girl' && (
        <>
          <circle cx="15.5" cy="27" r="2.4" fill="currentColor" opacity="0.7" />
          <circle cx="32.5" cy="27" r="2.4" fill="currentColor" opacity="0.7" />
        </>
      )}
    </svg>
  )
}
