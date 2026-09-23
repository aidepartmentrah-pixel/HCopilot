import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AccountFormDialog } from './AccountFormDialog'

describe('AccountFormDialog', () => {
  it('requires a password on create but not on edit', () => {
    const { rerender } = render(<AccountFormDialog open account="new" onSubmit={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByLabelText(/^Password/)).toBeRequired()

    rerender(
      <AccountFormDialog
        open
        account={{ user_id: 1, username: 'triage', name: '', role: 'user', sections: 'patients', settings_tabs: '', statistics_tabs: '' }}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByLabelText(/^Password/)).not.toBeRequired()
  })

  it('switching role to Admin grants every known permission key and disables the checkboxes', async () => {
    const user = userEvent.setup()
    render(<AccountFormDialog open account="new" onSubmit={vi.fn()} onClose={vi.fn()} />)

    expect(screen.getByRole('checkbox', { name: 'Home' })).not.toBeChecked()
    await user.click(screen.getByRole('radio', { name: 'Admin' }))
    expect(screen.getByRole('checkbox', { name: 'Home' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Home' })).toBeDisabled()
  })

  it('submits the real field values, dropping an empty password on edit', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(
      <AccountFormDialog
        open
        account={{ user_id: 2, username: 'triage', name: 'Triage User', role: 'user', sections: 'patients', settings_tabs: '', statistics_tabs: '' }}
        onSubmit={onSubmit}
        onClose={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ username: 'triage', name: 'Triage User', role: 'user', sections: 'patients' }),
    )
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty('password')
  })
})
