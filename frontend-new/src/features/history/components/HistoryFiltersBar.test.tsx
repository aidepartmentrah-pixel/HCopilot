import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { HistoryFiltersBar } from './HistoryFiltersBar'

const EMPTY_FILTERS = { search: '', acuity: '', bed: '', dateFrom: '', dateTo: '' }

describe('HistoryFiltersBar', () => {
  it('disables the Bed filter and labels it honestly when no stay has a recorded bed history', () => {
    render(<HistoryFiltersBar filters={EMPTY_FILTERS} onChange={vi.fn()} bedOptions={[]} />)
    const bedFilter = screen.getByRole('combobox', { name: 'Filter by bed' })
    expect(bedFilter).toBeDisabled()
    expect(screen.getByText('No Bed History Recorded')).toBeInTheDocument()
  })

  it('enables the Bed filter with real options when at least one stay has a bed history', () => {
    render(<HistoryFiltersBar filters={EMPTY_FILTERS} onChange={vi.fn()} bedOptions={['101', '201']} />)
    const bedFilter = screen.getByRole('combobox', { name: 'Filter by bed' })
    expect(bedFilter).not.toBeDisabled()
    expect(screen.getByText('All Beds')).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Bed 101' })).toBeInTheDocument()
  })
})
