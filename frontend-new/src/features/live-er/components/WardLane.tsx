import type { PlacementCardData } from '../utils'
import { PlacementCard } from './PlacementCard'
import styles from './WardLane.module.css'

interface WardLaneProps {
  title: string
  /** 'bed' shows the ward occupancy summary and "no beds configured" empty state; 'waiting' shows a plain count and the waiting-specific empty state. Explicit rather than inferred from `cards[0]`, which breaks when the lane is empty. */
  kind: 'bed' | 'waiting'
  cards: PlacementCardData[]
  onCardClick: (card: PlacementCardData) => void
  selectedCardId?: string | null
  assignableBedIds?: Set<string>
}

/** One ward = one framed panel whose cards wrap onto as many rows as needed, so every bed is visible without scrolling. */
export function WardLane({ title, kind, cards, onCardClick, selectedCardId, assignableBedIds }: WardLaneProps) {
  const occupiedCount = cards.filter((c) => c.statusLabel === 'Occupied').length
  const availableCount = cards.filter((c) => c.statusLabel === 'Available').length

  return (
    <section className={styles.lane}>
      <div className={styles.header}>
        <h3 className={styles.title}>{title}</h3>
        {kind === 'bed' ? (
          <span className={styles.summary}>
            {occupiedCount} Occupied · {availableCount} Available · {cards.length} Total
          </span>
        ) : (
          <span className={styles.count}>{cards.length}</span>
        )}
      </div>
      {cards.length === 0 ? (
        <p className={styles.empty}>
          {kind === 'bed' ? 'No beds configured for this area.' : 'No patients currently waiting without a bed.'}
        </p>
      ) : (
        <div className={styles.track}>
          {cards.map((card) => (
            <PlacementCard
              key={card.id}
              card={card}
              onClick={() => onCardClick(card)}
              selected={selectedCardId === card.id}
              assignable={assignableBedIds?.has(card.id)}
            />
          ))}
        </div>
      )}
    </section>
  )
}
