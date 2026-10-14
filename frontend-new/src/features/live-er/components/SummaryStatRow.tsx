import { BedDouble, Clock, Users } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Bed } from '@/types/bed'
import { formatWaitingDuration } from '../utils'
import type { PlacementCardData } from '../utils'
import styles from './SummaryStatRow.module.css'

interface SummaryStatRowProps {
  beds: Bed[]
  /** Patients still without a bed (waiting lane). */
  waiting: PlacementCardData[]
  /** Where each card scrolls to when clicked (element ids on the board). */
  bedsAnchorId: string
  waitingAnchorId: string
}

type Tone = 'indigo' | 'green' | 'neutral' | 'amber' | 'red'

interface StatCardProps {
  label: string
  value: number
  icon: ReactNode
  tone: Tone
  /** One line of real context under the number. */
  detail: ReactNode
  /** 0..100: draws a thin fill bar (occupancy). */
  fill?: number
  /** Draws a small pulsing dot — only for something that needs attention right now. */
  pulse?: boolean
  onClick: () => void
}

function StatCard({ label, value, icon, tone, detail, fill, pulse, onClick }: StatCardProps) {
  return (
    <button type="button" className={[styles.card, styles[tone]].join(' ')} onClick={onClick}>
      <span className={styles.top}>
        <span className={styles.label}>
          {label}
          {pulse && <span className={styles.pulse} aria-hidden="true" />}
        </span>
        <span className={styles.icon} aria-hidden="true">
          {icon}
        </span>
      </span>
      <span className={styles.value}>{value}</span>
      {fill != null && (
        <span className={styles.bar} aria-hidden="true">
          <span className={styles.barFill} style={{ width: `${Math.min(100, Math.max(0, fill))}%` }} />
        </span>
      )}
      <span className={styles.detail}>{detail}</span>
    </button>
  )
}

const WAITING_THRESHOLD_MINUTES = 5

function titleCase(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

/** "ICU 1 · Monitor 3 · Normal 8" — free beds by type, biggest group last so scarce critical types lead. */
export function freeBedsByType(beds: Bed[]): string {
  const counts = new Map<string, number>()
  for (const b of beds) if (b.bed_status === 'Available') counts.set(b.bed_type, (counts.get(b.bed_type) ?? 0) + 1)
  const label = (type: string) => (type.toLowerCase() === 'icu' ? 'ICU' : titleCase(type))
  return Array.from(counts.entries())
    .sort(([, a], [, b]) => a - b)
    .map(([type, n]) => `${label(type)} ${n}`)
    .join(' · ')
}

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

/** Four live counts, each with one line of real context; clicking jumps to the matching part of the board. */
export function SummaryStatRow({ beds, waiting, bedsAnchorId, waitingAnchorId }: SummaryStatRowProps) {
  const total = beds.length
  const occupied = beds.filter((b) => b.bed_status === 'Occupied').length
  const available = beds.filter((b) => b.bed_status === 'Available').length
  const occupancy = total > 0 ? Math.round((occupied / total) * 100) : 0

  const waits = waiting.map((c) => c.waitingMinutes).filter((m): m is number => m != null)
  const longest = waits.length ? Math.max(...waits) : null
  const over = waiting.filter((c) => c.waitingMinutes != null && c.waitingMinutes > WAITING_THRESHOLD_MINUTES)
  const oldestOver = over.length ? Math.max(...over.map((c) => c.waitingMinutes ?? 0)) : null

  return (
    <div className={styles.row}>
      <StatCard
        label="Occupied beds"
        value={occupied}
        icon={<BedDouble size={20} />}
        tone="indigo"
        fill={occupancy}
        detail={`of ${total} beds · ${occupancy}%`}
        onClick={() => scrollTo(bedsAnchorId)}
      />
      <StatCard
        label="Available beds"
        value={available}
        icon={<BedDouble size={20} />}
        tone={available === 0 ? 'amber' : 'green'}
        detail={available === 0 ? 'No free beds' : freeBedsByType(beds)}
        onClick={() => scrollTo(bedsAnchorId)}
      />
      <StatCard
        label="Without a bed"
        value={waiting.length}
        icon={<Users size={20} />}
        tone={waiting.length > 0 ? 'amber' : 'neutral'}
        detail={waiting.length > 0 ? `Longest wait ${formatWaitingDuration(longest)}` : 'Everyone has a bed'}
        onClick={() => scrollTo(waitingAnchorId)}
      />
      <StatCard
        label="Waiting > 5 min"
        value={over.length}
        icon={<Clock size={20} />}
        tone={over.length > 0 ? 'red' : 'neutral'}
        pulse={over.length > 0}
        detail={over.length > 0 ? `Oldest: ${formatWaitingDuration(oldestOver)}` : 'No one waiting over 5 min'}
        onClick={() => scrollTo(waitingAnchorId)}
      />
    </div>
  )
}
