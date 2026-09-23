import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PermissionsEditor } from './PermissionsEditor'

describe('PermissionsEditor', () => {
  it('reflects which real keys are already present in sections/settingsTabs', () => {
    render(<PermissionsEditor sections="home,statistics" settingsTabs="beds" onChange={vi.fn()} isAdmin={false} />)
    expect(screen.getByRole('checkbox', { name: 'Home' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Statistics' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'ER ISBAR Entry' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Beds' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Doctors' })).not.toBeChecked()
  })

  it('calls onChange with the toggled key added, preserving the rest', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<PermissionsEditor sections="home" settingsTabs="" onChange={onChange} isAdmin={false} />)
    await user.click(screen.getByRole('checkbox', { name: 'Statistics' }))
    expect(onChange).toHaveBeenCalledWith({ sections: 'home,statistics', settingsTabs: '' })
  })

  it('calls onChange with the toggled key removed', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<PermissionsEditor sections="home,statistics" settingsTabs="" onChange={onChange} isAdmin={false} />)
    await user.click(screen.getByRole('checkbox', { name: 'Home' }))
    expect(onChange).toHaveBeenCalledWith({ sections: 'statistics', settingsTabs: '' })
  })

  it('renders every checkbox checked and disabled for an admin, regardless of the real underlying keys', () => {
    render(<PermissionsEditor sections="" settingsTabs="" onChange={vi.fn()} isAdmin />)
    for (const checkbox of screen.getAllByRole('checkbox')) {
      expect(checkbox).toBeChecked()
      expect(checkbox).toBeDisabled()
    }
    expect(screen.getByText(/Admins have full access/)).toBeInTheDocument()
  })
})
