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
    expect(screen.queryByText('ER API unavailable')).not.toBeInTheDocument()
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
    expect(screen.getByText('ER API unavailable')).toBeInTheDocument()
  })

  it('shows the API-key-rejected message rather than an empty roster', () => {
    useErRoster.mockReturnValue(
      queryResult({ success: false, status: 'unauthorized', message: 'ER API key rejected (HTTP 401) — check the ER API key in Settings.', items: [] }),
    )
    render(<LiveErRoster activePatients={[]} draftErVisitId={null} onSelect={vi.fn()} onOpenFallback={vi.fn()} />)
    expect(screen.getByText(/ER API key rejected/)).toBeInTheDocument()
    expect(screen.queryByText('No patients on the roster')).not.toBeInTheDocument()
  })

  it('renders Arabic names, a readable gender label and the complaint (v1.2 ER API)', () => {
    useErRoster.mockReturnValue(
      queryResult({
        success: true,
        status: 'ok',
        items: [
          { er_visit_id: '8441', first_name: 'أحمد', father_name: 'خليل', last_name: 'منصور', gender: 'Male', gender_raw: 'ذكر', age: 48, chief_complaint: 'ألم في الصدر' },
          { er_visit_id: '8444', first_name: 'ليلى', father_name: null, last_name: 'حداد', gender: 'انثى', age: 30, chief_complaint: null },
        ],
      }),
    )
    render(<LiveErRoster activePatients={[]} draftErVisitId={null} onSelect={vi.fn()} onOpenFallback={vi.fn()} />)
    const [a, b] = screen.getAllByTestId('er-roster-row')
    expect(a).toHaveTextContent('أحمد خليل منصور')
    expect(a).toHaveTextContent('48 y · Male · ألم في الصدر')
    expect(a).not.toHaveTextContent('48ذ')
    expect(b).toHaveTextContent('ليلى حداد')
    expect(b).toHaveTextContent('30 y · Female')
  })

  it('shows a placeholder when every name part is null, and "—" when nothing else is known', () => {
    useErRoster.mockReturnValue(
      queryResult({
        success: true,
        status: 'ok',
        items: [{ er_visit_id: '8442', first_name: null, father_name: null, last_name: null, gender: null, gender_raw: 'X9', age: null, chief_complaint: null }],
      }),
    )
    render(<LiveErRoster activePatients={[]} draftErVisitId={null} onSelect={vi.fn()} onOpenFallback={vi.fn()} />)
    const row = screen.getByTestId('er-roster-row')
    expect(row).toHaveTextContent('Unnamed patient')
    expect(row).toHaveTextContent('—')
    expect(row).not.toHaveTextContent('X9')
  })
})
