import { StatusBadge } from '@/components/ui/StatusBadge'
import { ACUITY_TONE } from '@/features/isbar/constants'
import type { PlacementCardData } from '../utils'
import { formatWaitingDuration } from '../utils'
import { BedIllustration } from './BedIllustration'
import { SeatedPatientIllustration } from './SeatedPatientIllustration'
import styles from './PlacementCard.module.css'

interface PlacementCardProps {
  card: PlacementCardData
  onClick: () => void
  /** Indigo selected state — a distinct dimension from the card's own occupied/available/waiting semantic color (§25). */
  selected?: boolean
  /** An available bed while a waiting patient is selected — visually offered as an assignment target (§26). */
  assignable?: boolean
}

/**
 * One card renderer for beds and waiting patients (§9/§18/§21) — same
 * width, radius, padding, typography hierarchy, and status placement.
 * Only the illustration and semantic color differ between kinds.
 */
export function PlacementCard({ card, onClick, selected, assignable }: PlacementCardProps) {
  return (
    <button
      type="button"
      data-testid="placement-card"
      aria-pressed={selected || undefined}
      className={[
        styles.card,
        card.isWaitingOverThreshold ? styles.attention : '',
        selected ? styles.selected : '',
        assignable ? styles.assignable : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={onClick}
    >
      <div className={styles.illustrationRow}>
        <span className={[styles.illustration, styles[`tone-${card.statusTone}`]].join(' ')}>
          {card.kind === 'bed' ? <BedIllustration size={32} /> : <SeatedPatientIllustration size={32} />}
        </span>
        <StatusBadge label={card.statusLabel} tone={card.statusTone} />
      </div>

      <div className={styles.primary} data-testid="placement-card-primary">
        {card.primary}
      </div>

      {card.sub && (
        <div className={styles.sub} dir="auto">
          {card.sub}
        </div>
      )}
      {card.patientId != null && <div className={styles.meta}>#{card.patientId}</div>}

      <div className={styles.footer}>
        {card.bedType && <span className={styles.bedType}>{card.bedType}</span>}
        {card.acuity != null && <StatusBadge label={`ESI ${card.acuity}`} tone={ACUITY_TONE[card.acuity] ?? 'neutral'} />}
        {card.kind === 'waiting' && (
          <span className={[styles.waitingFlag, card.isWaitingOverThreshold ? styles.waitingFlagAttention : ''].join(' ')}>
            Waiting {formatWaitingDuration(card.waitingMinutes ?? null)}
          </span>
        )}
      </div>
    </button>
  )
}
