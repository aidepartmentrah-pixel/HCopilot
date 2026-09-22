import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ConfirmDialog } from './ConfirmDialog'

describe('ConfirmDialog', () => {
  it('fires onConfirm/onCancel from the matching button', async () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(
      <ConfirmDialog
        open
        title="Delete bed 302?"
        description="This cannot be undone."
        onConfirm={onConfirm}
        onCancel={onCancel}
        destructive
      />,
    )

    expect(screen.getByText('Delete bed 302?')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('renders nothing interactive when closed', () => {
    render(
      <ConfirmDialog
        open={false}
        title="Delete bed 302?"
        description="This cannot be undone."
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    // A closed <dialog> is `display: none` by the UA stylesheet, so its
    // content is correctly excluded from the accessibility tree — role
    // queries finding nothing here is the right outcome, not a null-check
    // workaround.
    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument()
  })
})
