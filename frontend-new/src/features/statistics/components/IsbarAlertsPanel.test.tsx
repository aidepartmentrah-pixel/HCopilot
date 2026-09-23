import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { IsbarAlertsPanel } from './IsbarAlertsPanel'

describe('IsbarAlertsPanel', () => {
  it('shows the critical/deteriorating banner only when at least one is documented', () => {
    render(
      <IsbarAlertsPanel
        clinicalStatus={{ labels: ['Stable', 'Critical'], counts: [8, 2], total: 10 }}
        o2Support={{ labels: [], counts: [], total: 0 }}
      />,
    )
    expect(screen.getByText(/2 patients currently documented as Critical or Deteriorating/)).toBeInTheDocument()
  })

  it('omits the critical banner when nothing is Critical or Deteriorating', () => {
    render(
      <IsbarAlertsPanel
        clinicalStatus={{ labels: ['Stable', 'Improving'], counts: [8, 2], total: 10 }}
        o2Support={{ labels: [], counts: [], total: 0 }}
      />,
    )
    expect(screen.queryByText(/Critical or Deteriorating/)).not.toBeInTheDocument()
  })

  it('sums only the advanced O2 support tiers, not room_air/nasal_cannula/simple_mask', () => {
    render(
      <IsbarAlertsPanel
        clinicalStatus={{ labels: [], counts: [], total: 0 }}
        o2Support={{ labels: ['room_air', 'nasal_cannula', 'mechanical_vent', 'cpap_bipap'], counts: [10, 5, 1, 2], total: 18 }}
      />,
    )
    expect(screen.getByText(/3 patients on advanced respiratory support/)).toBeInTheDocument()
  })

  it('renders nothing (not an empty panel shell) when neither condition is documented', () => {
    const { container } = render(
      <IsbarAlertsPanel clinicalStatus={{ labels: [], counts: [], total: 0 }} o2Support={{ labels: [], counts: [], total: 0 }} />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
