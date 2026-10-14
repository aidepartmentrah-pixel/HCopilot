import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Bed } from '@/types/bed'
import type { PlacementCardData } from '../utils'
import { SummaryStatRow, freeBedsByType } from './SummaryStatRow'

const bed = (id: number, status: Bed['bed_status'], type = 'normal'): Bed => ({
  bed_id: id,
  bed_number: String(id),
  bed_condition: 'Available',
  bed_status: status,
  bed_type: type,
  ward_id: 1,
  ward_name: 'W',
  patient_id: status === 'Occupied' ? id : null,
  patient_name: null,
  patient_gender: null,
  patient_age: null,
})

const waiting = (id: number, minutes: number | null): PlacementCardData => ({
  id: `w${id}`,
  kind: 'waiting',
  statusTone: 'waiting',
  statusLabel: 'Waiting',
  primary: 'P',
  sub: '',
  waitingMinutes: minutes,
  isWaitingOverThreshold: minutes != null && minutes > 5,
})

const renderRow = (beds: Bed[], w: PlacementCardData[]) =>
  render(<SummaryStatRow beds={beds} waiting={w} bedsAnchorId="b" waitingAnchorId="w" />)

describe('freeBedsByType', () => {
  it('lists free beds by type, scarce types first, ICU upper-cased', () => {
    const beds = [bed(1, 'Available', 'normal'), bed(2, 'Available', 'normal'), bed(3, 'Available', 'icu'), bed(4, 'Occupied', 'icu')]
    expect(freeBedsByType(beds)).toBe('ICU 1 · Normal 2')
  })
})

describe('SummaryStatRow', () => {
  it('shows occupancy and free beds', () => {
    renderRow([bed(1, 'Occupied'), bed(2, 'Occupied'), bed(3, 'Available'), bed(4, 'Available')], [])
    expect(screen.getByText('of 4 beds · 50%')).toBeInTheDocument()
    expect(screen.getByText('Normal 2')).toBeInTheDocument()
    expect(screen.getByText('Everyone has a bed')).toBeInTheDocument()
    expect(screen.getByText('No one waiting over 5 min')).toBeInTheDocument()
  })

  it('flags no free beds and long waits with real figures', () => {
    renderRow([bed(1, 'Occupied')], [waiting(1, 3), waiting(2, 18)])
    expect(screen.getByText('No free beds')).toBeInTheDocument()
    expect(screen.getByText('Longest wait 18 min')).toBeInTheDocument()
    expect(screen.getByText('Oldest: 18 min')).toBeInTheDocument()
  })
})
