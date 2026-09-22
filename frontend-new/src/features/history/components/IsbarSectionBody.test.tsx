import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { situationFields } from '../isbarFields'
import { IsbarSectionBody } from './IsbarSectionBody'

describe('IsbarSectionBody', () => {
  it('shows a "nothing recorded" message when every field is empty', () => {
    render(<IsbarSectionBody fields={situationFields(null)} />)
    expect(screen.getByText('Nothing recorded for this section.')).toBeInTheDocument()
  })

  it('renders only the populated fields, humanizing multi-select token lists', () => {
    render(
      <IsbarSectionBody
        fields={situationFields({
          clinical_status: 'Stable',
          immediate_concerns: 'chest_pain,respiratory_distress',
          reason_for_admission: null,
          current_diagnosis: null,
          immediate_concerns_other: null,
        })}
      />,
    )

    expect(screen.getByText('Clinical Status')).toBeInTheDocument()
    expect(screen.getByText('Stable')).toBeInTheDocument()
    expect(screen.getByText('Immediate Concerns')).toBeInTheDocument()
    expect(screen.getByText('Chest Pain, Respiratory Distress')).toBeInTheDocument()

    // Unrecorded fields are absent entirely, not shown blank.
    expect(screen.queryByText('Reason for Admission')).not.toBeInTheDocument()
    expect(screen.queryByText('Current Diagnosis')).not.toBeInTheDocument()
  })
})
