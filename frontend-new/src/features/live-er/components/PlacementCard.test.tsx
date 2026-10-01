import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { PlacementCardData } from '../utils'
import { PlacementCard } from './PlacementCard'

const occupiedCard: PlacementCardData = {
  id: 'bed-1',
  kind: 'bed',
  statusTone: 'occupied',
  statusLabel: 'Occupied',
  primary: 'Bed 301',
  sub: 'Chen, Marcus · 42y Male',
  patientId: 10000095,
  bedType: 'normal',
  isWaitingOverThreshold: false,
}

const waitingCard: PlacementCardData = {
  id: 'waiting-1',
  kind: 'waiting',
  statusTone: 'waiting',
  statusLabel: 'Waiting',
  primary: 'Wilson, Emily',
  sub: 'Chest pain',
  patientId: 10000105,
  acuity: 2,
  waitingMinutes: 8,
  isWaitingOverThreshold: true,
}

describe('PlacementCard', () => {
  it('shows real patient identity — name, ID, age/gender — on an occupied bed', () => {
    render(<PlacementCard card={occupiedCard} onClick={() => {}} />)
    expect(screen.getByText('Bed 301')).toBeInTheDocument()
    expect(screen.getByText('Chen, Marcus · 42y Male')).toBeInTheDocument()
    expect(screen.getByText('#10000095')).toBeInTheDocument()
  })

  it('shows ward and bed type under the bed number', () => {
    render(<PlacementCard card={{ ...occupiedCard, wardName: 'Section A' }} onClick={() => {}} />)
    expect(screen.getByText('Section A · normal')).toBeInTheDocument()
  })

  it('leads a waiting card with its acuity and shows the name, complaint and ID below', () => {
    render(<PlacementCard card={{ ...waitingCard, avatar: 'woman' }} onClick={() => {}} />)
    expect(screen.getByTestId('placement-card-primary')).toHaveTextContent('Acuity 2')
    expect(screen.getByTestId('placement-card-name')).toHaveTextContent('Wilson, Emily')
    expect(screen.getByText('Chest pain')).toBeInTheDocument()
    expect(screen.getByText('#10000105')).toBeInTheDocument()
  })

  it('shows a dash instead of "null" when a waiting patient has no acuity yet', () => {
    render(<PlacementCard card={{ ...waitingCard, acuity: null }} onClick={() => {}} />)
    expect(screen.getByTestId('placement-card-primary')).toHaveTextContent('Acuity —')
  })

  it('gives a long waiting-patient name a tooltip with the full text', () => {
    const longName = 'PAGINATION TEST Nora Saeed Al-Mansoori Extra Long Name'
    render(<PlacementCard card={{ ...waitingCard, primary: longName }} onClick={() => {}} />)
    expect(screen.getByTestId('placement-card-name')).toHaveAttribute('title', longName)
  })

  it('renders the avatar matching the patient (no emoji)', () => {
    const { container } = render(<PlacementCard card={{ ...waitingCard, avatar: 'girl' }} onClick={() => {}} />)
    expect(container.querySelector('[data-avatar="girl"]')).not.toBeNull()
  })

  it('shows a correctly-formatted waiting duration, not a raw minute count', () => {
    render(<PlacementCard card={waitingCard} onClick={() => {}} />)
    expect(screen.getByText('Waiting 08 min')).toBeInTheDocument()
  })

  it('applies the selected class independent of the card semantic tone', () => {
    render(<PlacementCard card={waitingCard} onClick={() => {}} selected />)
    expect(screen.getByTestId('placement-card').className).toMatch(/selected/)
    expect(screen.getByTestId('placement-card')).toHaveAttribute('aria-pressed', 'true')
  })

  it('applies the assignable class to an available bed when a patient is selected', () => {
    const availableCard: PlacementCardData = { ...occupiedCard, statusTone: 'success', statusLabel: 'Available', sub: '' }
    render(<PlacementCard card={availableCard} onClick={() => {}} assignable />)
    expect(screen.getByTestId('placement-card').className).toMatch(/assignable/)
  })
})
