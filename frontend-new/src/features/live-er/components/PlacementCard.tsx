import { Timer } from 'lucide-react'
import { StatusBadge } from '@/components/ui/StatusBadge'
import type { PlacementCardData } from '../utils'
import { formatWaitingDuration } from '../utils'
import { BedIllustration } from './BedIllustration'
import { PatientAvatar } from './PatientAvatar'
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
 * width, radius, padding, and centered stack. A bed leads with its number;
 * a waiting patient leads with its acuity (the thing staff triage by) and
 * shows the name below. Only the illustration and semantic tint differ.
 */
export function PlacementCard({ card, onClick, selected, assignable }: PlacementCardProps) {
  const isWaiting = card.kind === 'waiting'
  const headline = isWaiting ? `Acuity ${card.acuity ?? '—'}` : card.primary
  const bedMeta = [card.wardName, card.bedType].filter(Boolean).join(' · ')

  return (
    <button
      type="button"
      data-testid="placement-card"
      aria-pressed={selected || undefined}
      className={[
        styles.card,
        styles[`card-${card.statusTone}`],
        card.isWaitingOverThreshold ? styles.attention : '',
        selected ? styles.selected : '',
        assignable ? styles.assignable : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={onClick}
    >
      <span className={styles.illustration}>
        {isWaiting ? <PatientAvatar kind={card.avatar ?? 'neutral'} size={52} /> : <BedIllustration width={68} />}
      </span>

      <div className={styles.primary} data-testid="placement-card-primary">
        {headline}
      </div>
      <StatusBadge label={card.statusLabel} tone={card.statusTone} />

      {!isWaiting && bedMeta && <div className={styles.sub}>{bedMeta}</div>}
      {card.patientId != null && <div className={styles.meta}>#{card.patientId}</div>}

      {isWaiting && (
        <div className={styles.name} data-testid="placement-card-name" dir="auto" title={card.primary}>
          {card.primary}
        </div>
      )}
      {card.sub && (
        <div className={isWaiting ? styles.complaint : styles.name} dir="auto" title={card.sub}>
          {card.sub}
        </div>
      )}

      {isWaiting && (
        <span className={[styles.waitingFlag, card.isWaitingOverThreshold ? styles.waitingFlagAttention : ''].join(' ')}>
          <Timer size={12} aria-hidden="true" />
          Waiting {formatWaitingDuration(card.waitingMinutes ?? null)}
        </span>
      )}
    </button>
  )
}
