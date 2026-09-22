import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@/components/feedback/ToastProvider'
import { DangerZone } from './DangerZone'

describe('DangerZone', () => {
  it('keeps the Reset button disabled until the exact confirm phrase is typed', async () => {
    render(<DangerZone />, { wrapper: ToastProvider })
    const resetButton = screen.getByRole('button', { name: 'Reset Everything' })
    expect(resetButton).toBeDisabled()

    const input = screen.getByLabelText(/Type "RESET EVERYTHING" to confirm/)
    await userEvent.type(input, 'reset everything')
    expect(resetButton).toBeDisabled()

    await userEvent.clear(input)
    await userEvent.type(input, 'RESET EVERYTHING')
    expect(resetButton).toBeEnabled()
  })

  it('never calls the reset API just from typing — only an explicit click does', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    render(<DangerZone />, { wrapper: ToastProvider })
    const input = screen.getByLabelText(/Type "RESET EVERYTHING" to confirm/)
    await userEvent.type(input, 'RESET EVERYTHING')

    expect(fetchMock).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})
