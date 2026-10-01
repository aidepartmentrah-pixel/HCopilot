import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

  describe('collapsible waiting lane', () => {
    // jsdom has no ResizeObserver, so the lane falls back to 4 cards per row: 3 rows = 12 cards.
    const waiting = (n: number) =>
      Array.from({ length: n }, (_, i) => bedCard({ id: `waiting-${i}`, kind: 'waiting', statusLabel: 'Waiting', primary: `P${i}` }))

    it('shows only the first rows with a "Show all N" toggle, and expands/collapses on click', async () => {
      const user = userEvent.setup()
      render(<WardLane title="Waiting / No Bed" kind="waiting" collapsedRows={3} cards={waiting(20)} onCardClick={() => {}} />)
      expect(screen.getAllByTestId('placement-card')).toHaveLength(12)

      await user.click(screen.getByRole('button', { name: 'Show all 20' }))
      expect(screen.getAllByTestId('placement-card')).toHaveLength(20)

      await user.click(screen.getByRole('button', { name: 'Show less' }))
      expect(screen.getAllByTestId('placement-card')).toHaveLength(12)
    })

    it('shows no toggle when everything already fits', () => {
      render(<WardLane title="Waiting / No Bed" kind="waiting" collapsedRows={3} cards={waiting(5)} onCardClick={() => {}} />)
      expect(screen.queryByRole('button', { name: /Show/ })).not.toBeInTheDocument()
    })

    it('never collapses a lane that has no collapsedRows (ward lanes show every bed)', () => {
      render(<WardLane title="Section A" kind="bed" cards={waiting(20)} onCardClick={() => {}} />)
      expect(screen.getAllByTestId('placement-card')).toHaveLength(20)
      expect(screen.queryByRole('button', { name: /Show/ })).not.toBeInTheDocument()
    })

    it('auto-expands so a selected card is never hidden behind the fold', () => {
      render(
        <WardLane title="Waiting / No Bed" kind="waiting" collapsedRows={3} cards={waiting(20)} selectedCardId="waiting-17" onCardClick={() => {}} />,
      )
      expect(screen.getAllByTestId('placement-card')).toHaveLength(20)
      expect(screen.getByRole('button', { name: 'Show less' })).toBeInTheDocument()
    })
  })

  it('calls onCardClick with the clicked card', async () => {
    const onCardClick = vi.fn()
    const cards = [bedCard({ id: 'bed-1', primary: 'Bed 101' })]
    render(<WardLane title="Section A" kind="bed" cards={cards} onCardClick={onCardClick} />)
    screen.getByTestId('placement-card').click()
    expect(onCardClick).toHaveBeenCalledWith(cards[0])
  })
})
