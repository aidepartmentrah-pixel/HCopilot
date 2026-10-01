import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { PlacementCardData } from '../utils'
import { WardLane } from './WardLane'

function bedCard(overrides: Partial<PlacementCardData>): PlacementCardData {
  return {
    id: 'bed-1',
    kind: 'bed',
    statusTone: 'success',
    statusLabel: 'Available',
    primary: 'Bed 101',
    sub: '',
    isWaitingOverThreshold: false,
    ...overrides,
  }
}

describe('WardLane', () => {
  it('shows the ward summary (occupied/available/total) for a bed lane', () => {
    const cards = [
      bedCard({ id: 'bed-1', statusLabel: 'Available' }),
      bedCard({ id: 'bed-2', statusLabel: 'Occupied' }),
      bedCard({ id: 'bed-3', statusLabel: 'Occupied' }),
    ]
    render(<WardLane title="Section A" kind="bed" cards={cards} onCardClick={() => {}} />)
    expect(screen.getByText('2 Occupied · 1 Available · 3 Total')).toBeInTheDocument()
  })

  it('shows a plain count (not a ward summary) for the waiting lane', () => {
    const cards = [bedCard({ id: 'waiting-1', kind: 'waiting', statusLabel: 'Waiting' })]
    render(<WardLane title="Waiting / No Bed" kind="waiting" cards={cards} onCardClick={() => {}} />)
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.queryByText(/Occupied ·/)).not.toBeInTheDocument()
  })

  it('shows a restrained empty state instead of an empty ward box', () => {
    render(<WardLane title="Recovery Room" kind="bed" cards={[]} onCardClick={() => {}} />)
    expect(screen.getByText('No beds configured for this area.')).toBeInTheDocument()
  })

  it('renders every card in the lane with no scroll controls', () => {
    const cards = Array.from({ length: 12 }, (_, i) => bedCard({ id: `bed-${i}`, primary: `Bed ${i}` }))
    render(<WardLane title="Section A" kind="bed" cards={cards} onCardClick={() => {}} />)
    expect(screen.getAllByTestId('placement-card')).toHaveLength(12)
    expect(screen.queryByRole('button', { name: /Scroll/ })).not.toBeInTheDocument()
  })

  it('calls onCardClick with the clicked card', async () => {
    const onCardClick = vi.fn()
    const cards = [bedCard({ id: 'bed-1', primary: 'Bed 101' })]
    render(<WardLane title="Section A" kind="bed" cards={cards} onCardClick={onCardClick} />)
    screen.getByTestId('placement-card').click()
    expect(onCardClick).toHaveBeenCalledWith(cards[0])
  })
})
