import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { IsbarAlertsPanel } from './IsbarAlertsPanel'

describe('IsbarAlertsPanel', () => {
  it('shows the critical/deteriorating banner only when at least one is documented', () => {
    render(
      <IsbarAlertsPanel
        clinicalStatus={{ labels: ['Stable', 'Critical'], counts: [8, 2], total: 10 }}
        immediateConcerns={{ labels: [], counts: [], total: 0 }}
        safetyRisks={{
          documented_total: 10,
          risks: {
            fall_risk: { count: 0, pct: 0 },
            pressure_injury_risk: { count: 0, pct: 0 },
            allergies: { count: 0, pct: 0 },
            isolation_precautions: { count: 0, pct: 0 },
          },
        }}
        o2Support={{ labels: [], counts: [], total: 0 }}
      />,
    )
    expect(screen.getByText(/2 patients currently documented as Critical or Deteriorating/)).toBeInTheDocument()
  })

  it('omits the critical banner when nothing is Critical or Deteriorating', () => {
    render(
      <IsbarAlertsPanel
        clinicalStatus={{ labels: ['Stable', 'Improving'], counts: [8, 2], total: 10 }}
        immediateConcerns={{ labels: [], counts: [], total: 0 }}
        safetyRisks={{
          documented_total: 10,
          risks: {
            fall_risk: { count: 0, pct: 0 },
            pressure_injury_risk: { count: 0, pct: 0 },
            allergies: { count: 0, pct: 0 },
            isolation_precautions: { count: 0, pct: 0 },
          },
        }}
        o2Support={{ labels: [], counts: [], total: 0 }}
      />,
    )
    expect(screen.queryByText(/Critical or Deteriorating/)).not.toBeInTheDocument()
  })

  it('sums only the advanced O2 support tiers, not room_air/nasal_cannula/simple_mask', () => {
    render(
      <IsbarAlertsPanel
        clinicalStatus={{ labels: [], counts: [], total: 0 }}
        immediateConcerns={{ labels: [], counts: [], total: 0 }}
        safetyRisks={{
          documented_total: 0,
          risks: {
            fall_risk: { count: 0, pct: 0 },
            pressure_injury_risk: { count: 0, pct: 0 },
            allergies: { count: 0, pct: 0 },
            isolation_precautions: { count: 0, pct: 0 },
          },
        }}
        o2Support={{ labels: ['room_air', 'nasal_cannula', 'mechanical_vent', 'cpap_bipap'], counts: [10, 5, 1, 2], total: 18 }}
      />,
    )
    expect(screen.getByText(/3 patients on advanced respiratory support/)).toBeInTheDocument()
  })

  it('marks a high-severity concern distinctly from a routine one', () => {
    render(
      <IsbarAlertsPanel
        clinicalStatus={{ labels: [], counts: [], total: 0 }}
        immediateConcerns={{ labels: ['chest_pain', 'fever_infection'], counts: [4, 2], total: 6 }}
        safetyRisks={{
          documented_total: 0,
          risks: {
            fall_risk: { count: 0, pct: 0 },
            pressure_injury_risk: { count: 0, pct: 0 },
            allergies: { count: 0, pct: 0 },
            isolation_precautions: { count: 0, pct: 0 },
          },
        }}
        o2Support={{ labels: [], counts: [], total: 0 }}
      />,
    )
    expect(screen.getByText('Chest Pain').className).toMatch(/severeLabel/)
    expect(screen.getByText('Fever Infection').className).not.toMatch(/severeLabel/)
  })

  it('shows an empty state instead of a blank panel when nothing has been documented at all', () => {
    render(
      <IsbarAlertsPanel
        clinicalStatus={{ labels: [], counts: [], total: 0 }}
        immediateConcerns={{ labels: [], counts: [], total: 0 }}
        safetyRisks={{
          documented_total: 0,
          risks: {
            fall_risk: { count: 0, pct: 0 },
            pressure_injury_risk: { count: 0, pct: 0 },
            allergies: { count: 0, pct: 0 },
            isolation_precautions: { count: 0, pct: 0 },
          },
        }}
        o2Support={{ labels: [], counts: [], total: 0 }}
      />,
    )
    expect(screen.getByText('No ISBAR nursing documentation yet')).toBeInTheDocument()
  })
})
