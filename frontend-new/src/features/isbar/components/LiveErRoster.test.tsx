import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LiveErRoster } from './LiveErRoster'

const useErRoster = vi.fn()
vi.mock('@/hooks/useErRoster', () => ({ useErRoster: () => useErRoster() }))

function queryResult(data: unknown) {
  return { data, isLoading: false, error: null, refetch: vi.fn(), isFetching: false }
}

describe('LiveErRoster', () => {
  beforeEach(() => useErRoster.mockReset())

  it('shows a neutral note (not an error) and opens the fallback once when the roster switch is off', () => {
    useErRoster.mockReturnValue(queryResult({ success: false, status: 'roster_off', message: 'Live ER roster is not enabled.', items: [] }))
    const onOpenFallback = vi.fn()
    const { rerender } = render(<LiveErRoster activePatients={[]} draftErVisitId={null} onSelect={vi.fn()} onOpenFallback={onOpenFallback} />)

    expect(screen.getByTestId('er-roster-off-note')).toHaveTextContent(/not enabled/i)
    expect(screen.queryByText('Hospital Directory unavailable')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /refresh roster/i })).not.toBeInTheDocument()
    expect(onOpenFallback).toHaveBeenCalledTimes(1)

    rerender(<LiveErRoster activePatients={[]} draftErVisitId={null} onSelect={vi.fn()} onOpenFallback={onOpenFallback} />)
    expect(onOpenFallback).toHaveBeenCalledTimes(1) // doesn't fight the user's own toggle
  })

  it('still shows the roster rows when enabled', () => {
    useErRoster.mockReturnValue(
      queryResult({ success: true, status: 'ok', items: [{ er_visit_id: '1', first_name: 'A', father_name: 'B', last_name: 'C' }] }),
    )
    const onOpenFallback = vi.fn()
    render(<LiveErRoster activePatients={[]} draftErVisitId={null} onSelect={vi.fn()} onOpenFallback={onOpenFallback} />)
    expect(screen.getByRole('heading', { name: 'Live ER Roster' })).toBeInTheDocument()
    expect(screen.getByTestId('er-roster-row')).toHaveTextContent('A B C')
    expect(onOpenFallback).not.toHaveBeenCalled()
  })

  it('keeps the unavailable error for a genuine outage', () => {
    useErRoster.mockReturnValue(queryResult({ success: false, status: 'timeout', message: 'slow', items: [] }))
    render(<LiveErRoster activePatients={[]} draftErVisitId={null} onSelect={vi.fn()} onOpenFallback={vi.fn()} />)
    expect(screen.getByText('Hospital Directory unavailable')).toBeInTheDocument()
  })
})
