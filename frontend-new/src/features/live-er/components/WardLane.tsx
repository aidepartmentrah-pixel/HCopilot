import { useEffect, useRef, useState } from 'react'
import type { PlacementCardData } from '../utils'
import { PlacementCard } from './PlacementCard'
import styles from './WardLane.module.css'

/** Cards per row assumed where the lane can't be measured (no ResizeObserver). */
const FALLBACK_CARDS_PER_ROW = 4

interface WardLaneProps {
  title: string
  /** DOM id so the summary cards can scroll here. */
  id?: string
  /** 'bed' shows the ward occupancy summary and "no beds configured" empty state; 'waiting' shows a plain count and the waiting-specific empty state. Explicit rather than inferred from `cards[0]`, which breaks when the lane is empty. */
  kind: 'bed' | 'waiting'
  cards: PlacementCardData[]
  onCardClick: (card: PlacementCardData) => void
  selectedCardId?: string | null
  assignableBedIds?: Set<string>
  /** Collapse the lane to this many rows with a "Show all" toggle. Omit to always show every card (ward lanes — every bed must be visible). */
  collapsedRows?: number
}

/** One ward = one framed panel whose cards wrap onto as many rows as needed, so every bed is visible without scrolling. */
export function WardLane({ title, id, kind, cards, onCardClick, selectedCardId, assignableBedIds, collapsedRows }: WardLaneProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [cardsPerRow, setCardsPerRow] = useState(FALLBACK_CARDS_PER_ROW)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    const el = trackRef.current
    if (!el || collapsedRows == null || typeof ResizeObserver === 'undefined') return
    // The grid decides its own column count (auto-fill); read it back instead of duplicating that math.
    const measure = () => setCardsPerRow(Math.max(1, getComputedStyle(el).gridTemplateColumns.split(' ').length))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [collapsedRows, cards.length])

  const limit = collapsedRows != null ? cardsPerRow * collapsedRows : Infinity
  const isCollapsible = cards.length > limit

  // A selected card must never be hidden behind the collapsed fold.
  const selectedIndex = selectedCardId ? cards.findIndex((c) => c.id === selectedCardId) : -1
  const selectionHidden = selectedIndex >= limit
  useEffect(() => {
    if (selectionHidden) setExpanded(true)
  }, [selectionHidden])

  const visibleCards = isCollapsible && !expanded ? cards.slice(0, limit) : cards

  const occupiedCount = cards.filter((c) => c.statusLabel === 'Occupied').length
  const availableCount = cards.filter((c) => c.statusLabel === 'Available').length

  return (
    <section id={id} className={styles.lane}>
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
        <div ref={trackRef} className={styles.track}>
          {visibleCards.map((card) => (
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
      {isCollapsible && (
        <button type="button" className={styles.toggle} aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
          {expanded ? 'Show less' : `Show all ${cards.length}`}
        </button>
      )}
    </section>
  )
}
