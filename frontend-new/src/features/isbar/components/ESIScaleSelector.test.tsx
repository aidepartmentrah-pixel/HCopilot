import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ESIScaleSelector } from './ESIScaleSelector'

describe('ESIScaleSelector', () => {
  it('renders all 5 ESI levels', () => {
    render(<ESIScaleSelector id="acuity" value={undefined} onChange={() => {}} />)
    for (const level of [1, 2, 3, 4, 5]) {
      expect(screen.getByRole('radio', { name: new RegExp(`^${level}`) })).toBeInTheDocument()
    }
  })

  it('marks the matching level as checked and stores the right value on click', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<ESIScaleSelector id="acuity" value={2} onChange={onChange} />)

    expect(screen.getByRole('radio', { name: /^2/ })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: /^4/ })).toHaveAttribute('aria-checked', 'false')

    await user.click(screen.getByRole('radio', { name: /^4/ }))
    expect(onChange).toHaveBeenCalledWith(4)
  })

  it('is keyboard-operable — each level is a real, focusable, activatable button', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<ESIScaleSelector id="acuity" value={undefined} onChange={onChange} />)

    const level3 = screen.getByRole('radio', { name: /^3/ })
    level3.focus()
    expect(level3).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(onChange).toHaveBeenCalledWith(3)
  })

  it('disables every level when disabled', () => {
    render(<ESIScaleSelector id="acuity" value={undefined} onChange={() => {}} disabled />)
    for (const level of [1, 2, 3, 4, 5]) {
      expect(screen.getByRole('radio', { name: new RegExp(`^${level}`) })).toBeDisabled()
    }
  })
})
