import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Dialog } from './Dialog'

describe('Dialog', () => {
  it('renders nothing while closed', () => {
    render(
      <Dialog open={false} onClose={() => {}}>
        <p>hidden</p>
      </Dialog>,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByText('hidden')).not.toBeInTheDocument()
  })

  it('is an accessible modal dialog, labelled by its title, that does not use the native <dialog> element', () => {
    render(
      <Dialog open onClose={() => {}} aria-labelledby="t">
        <h2 id="t">Manage Bed</h2>
        <button type="button">Go</button>
      </Dialog>,
    )
    const dialog = screen.getByRole('dialog', { name: 'Manage Bed' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog.tagName).toBe('DIV') // works where <dialog>/showModal() does not exist (Firefox < 98)
  })

  it('moves focus inside on open and honours autoFocus', () => {
    render(
      <Dialog open onClose={() => {}}>
        <button type="button">first</button>
        <button type="button" autoFocus>
          preferred
        </button>
      </Dialog>,
    )
    expect(screen.getByRole('button', { name: 'preferred' })).toHaveFocus()
  })

  it('focuses the first control when nothing asked for focus', () => {
    render(
      <Dialog open onClose={() => {}}>
        <button type="button">first</button>
        <button type="button">second</button>
      </Dialog>,
    )
    expect(screen.getByRole('button', { name: 'first' })).toHaveFocus()
  })

  it('keeps Tab inside the dialog (wraps from last to first and back)', async () => {
    const user = userEvent.setup()
    render(
      <>
        <button type="button">outside</button>
        <Dialog open onClose={() => {}}>
          <button type="button">one</button>
          <button type="button">two</button>
        </Dialog>
      </>,
    )
    expect(screen.getByRole('button', { name: 'one' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'two' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'one' })).toHaveFocus()
    await user.tab({ shift: true })
    expect(screen.getByRole('button', { name: 'two' })).toHaveFocus()
  })

  it('closes on Escape but not on a click outside the panel', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(
      <Dialog open onClose={onClose}>
        <button type="button">x</button>
      </Dialog>,
    )
    await user.click(document.body)
    expect(onClose).not.toHaveBeenCalled()
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes only the topmost of two stacked dialogs on Escape', async () => {
    const lower = vi.fn()
    const upper = vi.fn()
    const user = userEvent.setup()
    render(
      <>
        <Dialog open onClose={lower}>
          <button type="button">lower</button>
        </Dialog>
        <Dialog open onClose={upper}>
          <button type="button">upper</button>
        </Dialog>
      </>,
    )
    await user.keyboard('{Escape}')
    expect(upper).toHaveBeenCalledTimes(1)
    expect(lower).not.toHaveBeenCalled()
  })

  it('locks page scrolling while open and gives focus back to the opener on close', async () => {
    const user = userEvent.setup()
    function Harness() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            opener
          </button>
          <Dialog open={open} onClose={() => setOpen(false)}>
            <button type="button">inside</button>
          </Dialog>
        </>
      )
    }
    render(<Harness />)
    const opener = screen.getByRole('button', { name: 'opener' })
    await user.click(opener)
    expect(document.body.style.overflow).toBe('hidden')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(document.body.style.overflow).toBe('')
    expect(opener).toHaveFocus()
  })
})
