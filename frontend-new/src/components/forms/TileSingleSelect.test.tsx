import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { TileSingleSelect } from './TileSingleSelect'

const OPTIONS = ['Stable', 'Improving', 'Critical'] as const

describe('TileSingleSelect', () => {
  it('renders every option as a visible tile, not hidden in a dropdown', () => {
    render(<TileSingleSelect id="clinical_status" value={null} onChange={() => {}} options={OPTIONS} />)
    for (const option of OPTIONS) {
      expect(screen.getByRole('radio', { name: option })).toBeInTheDocument()
    }
  })

  it('marks the matching option checked and stores the right value on click', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<TileSingleSelect id="clinical_status" value="Stable" onChange={onChange} options={OPTIONS} />)

    expect(screen.getByRole('radio', { name: 'Stable' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'Critical' })).toHaveAttribute('aria-checked', 'false')

    await user.click(screen.getByRole('radio', { name: 'Critical' }))
    expect(onChange).toHaveBeenCalledWith('Critical')
  })

  it('humanizes snake_case string options for display', () => {
    render(<TileSingleSelect id="isolation" value={null} onChange={() => {}} options={['contact_precaution']} />)
    expect(screen.getByRole('radio', { name: 'Contact Precaution' })).toBeInTheDocument()
  })
})
