import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from './ToastProvider'
import { useToast } from './useToast'

function Trigger() {
  const { showToast } = useToast()
  return (
    <button type="button" onClick={() => showToast('Bed assigned', 'success')}>
      Fire
    </button>
  )
}

describe('ToastProvider / useToast', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows a toast and auto-dismisses it after the timeout', () => {
    // fireEvent, not userEvent: userEvent's internal delays run on real
    // timers and hang if fake timers are active underneath them.
    vi.useFakeTimers()
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Fire' }))
    expect(screen.getByText('Bed assigned')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(screen.queryByText('Bed assigned')).not.toBeInTheDocument()
  })

  it('dismisses immediately when the close button is clicked', async () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Fire' }))
    expect(screen.getByText('Bed assigned')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }))
    expect(screen.queryByText('Bed assigned')).not.toBeInTheDocument()
  })

  it('throws a clear error when used outside a ToastProvider', () => {
    function Bare() {
      useToast()
      return null
    }
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Bare />)).toThrow('useToast must be used within a ToastProvider')
    consoleError.mockRestore()
  })
})
