import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useRef } from 'react'
import { IconButton } from '@/components/ui/IconButton'
import type { PlacementCardData } from '../utils'
import { PlacementCard } from './PlacementCard'
import styles from './WardLane.module.css'

interface WardLaneProps {
  title: string
  cards: PlacementCardData[]
  onCardClick: (card: PlacementCardData) => void
}

/** One ward = one horizontal, scrollable lane (§21) — not a wrap-grid. */
export function WardLane({ title, cards, onCardClick }: WardLaneProps) {
  const trackRef = useRef<HTMLDivElement>(null)

  function scrollBy(delta: number) {
    trackRef.current?.scrollBy({ left: delta, behavior: 'smooth' })
  }

  return (
    <section className={styles.lane}>
      <div className={styles.header}>
        <h3 className={styles.title}>{title}</h3>
        <span className={styles.count}>{cards.length}</span>
        <div className={styles.scrollControls}>
          <IconButton icon={<ChevronLeft size={16} />} label={`Scroll ${title} left`} size="sm" onClick={() => scrollBy(-360)} />
          <IconButton icon={<ChevronRight size={16} />} label={`Scroll ${title} right`} size="sm" onClick={() => scrollBy(360)} />
        </div>
      </div>
      <div ref={trackRef} className={styles.track}>
        {cards.map((card) => (
          <PlacementCard key={card.id} card={card} onClick={() => onCardClick(card)} />
        ))}
      </div>
    </section>
  )
}
