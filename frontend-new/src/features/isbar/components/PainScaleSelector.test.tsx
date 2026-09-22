import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { PainScaleSelector } from './PainScaleSelector'

function ControlledPainScale() {
  const [value, setValue] = useState<string | null>(null)
  return <PainScaleSelector id="pain" value={value} onChange={setValue} />
}

describe('PainScaleSelector', () => {
  it('renders 11 cells, 0 through 10', () => {
    render(<PainScaleSelector id="pain" value={null} onChange={() => {}} />)
    for (let n = 0; n <= 10; n++) {
      expect(screen.getByRole('radio', { name: String(n) })).toBeInTheDocument()
    }
  })

  it('stores the numeric value as a string on click', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<PainScaleSelector id="pain" value={null} onChange={onChange} />)
    await user.click(screen.getByRole('radio', { name: '7' }))
    expect(onChange).toHaveBeenCalledWith('7')
  })

  it('applies the low/mid/high semantic band class matching the selected value', () => {
    const { rerender } = render(<PainScaleSelector id="pain" value="2" onChange={() => {}} />)
    expect(screen.getByRole('radio', { name: '2' }).className).toMatch(/low/)

    rerender(<PainScaleSelector id="pain" value="5" onChange={() => {}} />)
    expect(screen.getByRole('radio', { name: '5' }).className).toMatch(/mid/)

    rerender(<PainScaleSelector id="pain" value="9" onChange={() => {}} />)
    expect(screen.getByRole('radio', { name: '9' }).className).toMatch(/high/)
  })

  it('marks the matching cell checked and no cell checked for a non-numeric (description) value', () => {
    const { rerender } = render(<PainScaleSelector id="pain" value="4" onChange={() => {}} />)
    expect(screen.getByRole('radio', { name: '4' })).toHaveAttribute('aria-checked', 'true')

    rerender(<PainScaleSelector id="pain" value="intermittent, positional" onChange={() => {}} />)
    for (let n = 0; n <= 10; n++) {
      expect(screen.getByRole('radio', { name: String(n) })).toHaveAttribute('aria-checked', 'false')
    }
  })

  it('preserves free-text description entry alongside the scale (§43 — no functionality removed)', async () => {
    const user = userEvent.setup()
    render(<ControlledPainScale />)
    await user.type(screen.getByLabelText('Pain description (if not a 0-10 score)'), 'intermittent')
    expect(screen.getByLabelText('Pain description (if not a 0-10 score)')).toHaveValue('intermittent')
  })
})
