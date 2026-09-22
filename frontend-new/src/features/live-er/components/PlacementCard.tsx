import { BedIcon, Clock, UserRound } from 'lucide-react'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { ACUITY_TONE } from '@/features/isbar/constants'
import type { PlacementCardData } from '../utils'
import styles from './PlacementCard.module.css'

interface PlacementCardProps {
  card: PlacementCardData
  onClick: () => void
}

/**
 * One card renderer for both beds and waiting patients (§21) — same width,
 * height, radius, padding, typography hierarchy, status location, and
 * action placement. Only the icon and status treatment differ.
 */
export function PlacementCard({ card, onClick }: PlacementCardProps) {
  return (
    <button
      type="button"
      data-testid="placement-card"
      className={[styles.card, card.isWaitingOverThreshold ? styles.attention : ''].filter(Boolean).join(' ')}
      onClick={onClick}
    >
      <div className={styles.iconRow}>
        <span className={styles.icon} aria-hidden="true">
          {card.kind === 'bed' ? <BedIcon size={18} /> : <UserRound size={18} />}
        </span>
        <StatusBadge label={card.statusLabel} tone={card.statusTone} />
      </div>
      <div className={styles.primary}>{card.primary}</div>
      {card.sub && (
        <div className={styles.sub} dir="auto">
          {card.sub}
        </div>
      )}
      <div className={styles.footer}>
        {card.acuity != null && <StatusBadge label={`ESI ${card.acuity}`} tone={ACUITY_TONE[card.acuity] ?? 'neutral'} />}
        {card.isWaitingOverThreshold && (
          <span className={styles.waitingFlag}>
            <Clock size={12} aria-hidden="true" /> Waiting
          </span>
        )}
      </div>
    </button>
  )
}
