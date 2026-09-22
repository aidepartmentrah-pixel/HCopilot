import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { UnitInput } from './UnitInput'

describe('UnitInput', () => {
  it('shows the unit suffix', () => {
    render(<UnitInput unit="°C" aria-label="Temperature" />)
    expect(screen.getByText('°C')).toBeInTheDocument()
  })

  it('keeps the unit suffix visible after a value is typed', async () => {
    const user = userEvent.setup()
    render(<UnitInput unit="bpm" type="number" aria-label="Heart Rate" />)
    await user.type(screen.getByLabelText('Heart Rate'), '88')
    expect(screen.getByLabelText('Heart Rate')).toHaveValue(88)
    expect(screen.getByText('bpm')).toBeInTheDocument()
  })
})
