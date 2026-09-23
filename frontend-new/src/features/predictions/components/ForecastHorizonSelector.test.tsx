import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ForecastHorizonSelector } from './ForecastHorizonSelector'

describe('ForecastHorizonSelector', () => {
  it('renders exactly the three backend-supported horizons, never invented ones', () => {
    render(<ForecastHorizonSelector value={30} onChange={vi.fn()} />)
    expect(screen.getByRole('radio', { name: '30 Days' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '60 Days' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '90 Days' })).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: '7 Days' })).not.toBeInTheDocument()
  })

  it('marks the current value checked', () => {
    render(<ForecastHorizonSelector value={60} onChange={vi.fn()} />)
    expect(screen.getByRole('radio', { name: '60 Days' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: '30 Days' })).toHaveAttribute('aria-checked', 'false')
  })

  it('calls onChange with the selected horizon', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<ForecastHorizonSelector value={30} onChange={onChange} />)
    await user.click(screen.getByRole('radio', { name: '90 Days' }))
    expect(onChange).toHaveBeenCalledWith(90)
  })
})
