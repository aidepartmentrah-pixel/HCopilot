import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { IconButton } from '@/components/ui/IconButton'
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

/** One ward = one horizontal, scrollable lane (§21) — not a wrap-grid. */
export function WardLane({ title, kind, cards, onCardClick, selectedCardId, assignableBedIds }: WardLaneProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  function updateScrollBounds() {
    const el = trackRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 4)
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4)
  }

  useEffect(() => {
    updateScrollBounds()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards.length])

  function scrollBy(delta: number) {
    trackRef.current?.scrollBy({ left: delta, behavior: 'smooth' })
  }

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
        <div className={styles.scrollControls}>
          <IconButton
            icon={<ChevronLeft size={16} />}
            label={`Scroll ${title} left`}
            size="sm"
            disabled={!canScrollLeft}
            onClick={() => scrollBy(-420)}
          />
          <IconButton
            icon={<ChevronRight size={16} />}
            label={`Scroll ${title} right`}
            size="sm"
            disabled={!canScrollRight}
            onClick={() => scrollBy(420)}
          />
        </div>
      </div>
      {cards.length === 0 ? (
        <p className={styles.empty}>
          {kind === 'bed' ? 'No beds configured for this area.' : 'No patients currently waiting without a bed.'}
        </p>
      ) : (
        <div ref={trackRef} className={styles.track} onScroll={updateScrollBounds}>
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
