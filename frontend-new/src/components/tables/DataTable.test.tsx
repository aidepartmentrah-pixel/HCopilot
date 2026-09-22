import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ColumnDef } from '@tanstack/react-table'
import { describe, expect, it, vi } from 'vitest'
import { DataTable } from './DataTable'

interface Row {
  id: string
  name: string
  age: number
}

const rows: Row[] = [
  { id: '1', name: 'Wilson, Emily', age: 28 },
  { id: '2', name: 'Chen, Marcus', age: 42 },
]

const columns: ColumnDef<Row, unknown>[] = [
  { accessorKey: 'name', header: 'Patient' },
  { accessorKey: 'age', header: 'Age' },
]

describe('DataTable', () => {
  it('sorts rows when a sortable header is clicked', async () => {
    render(<DataTable data={rows} columns={columns} getRowId={(r) => r.id} />)

    const bodyRowsBefore = screen.getAllByRole('row').slice(1)
    expect(within(bodyRowsBefore[0]).getByText('Wilson, Emily')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Patient' }))

    const bodyRowsAfter = screen.getAllByRole('row').slice(1)
    expect(within(bodyRowsAfter[0]).getByText('Chen, Marcus')).toBeInTheDocument()
  })

  it('calls onRowClick with the row data', async () => {
    const onRowClick = vi.fn()
    render(<DataTable data={rows} columns={columns} getRowId={(r) => r.id} onRowClick={onRowClick} />)

    await userEvent.click(screen.getByText('Wilson, Emily'))
    expect(onRowClick).toHaveBeenCalledWith(rows[0])
  })

  it('shows an empty state instead of an empty table', () => {
    render(
      <DataTable
        data={[]}
        columns={columns}
        getRowId={(r) => r.id}
        emptyTitle="No patients found"
      />,
    )
    expect(screen.getByText('No patients found')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('shows an error state with a retry action', async () => {
    const onRetry = vi.fn()
    render(<DataTable data={[]} columns={columns} getRowId={(r) => r.id} error="Network error" onRetry={onRetry} />)

    expect(screen.getByText('Network error')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Try Again' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('paginates rather than rendering every row at once, and Next/Previous navigate pages', async () => {
    const manyRows: Row[] = Array.from({ length: 45 }, (_, i) => ({ id: String(i), name: `Patient ${i}`, age: 30 }))
    render(<DataTable data={manyRows} columns={columns} getRowId={(r) => r.id} pageSize={20} />)

    expect(screen.getAllByRole('row')).toHaveLength(21) // 1 header + 20 body rows
    expect(screen.getByText('Page 1 of 3 (45 total)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled()

    await userEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(screen.getByText('Page 2 of 3 (45 total)')).toBeInTheDocument()
    expect(screen.getByText('Patient 20')).toBeInTheDocument()
    expect(screen.queryByText('Patient 0')).not.toBeInTheDocument()
  })

  it('shows no pagination controls when everything fits on one page', () => {
    render(<DataTable data={rows} columns={columns} getRowId={(r) => r.id} pageSize={20} />)
    expect(screen.queryByRole('button', { name: 'Next page' })).not.toBeInTheDocument()
  })

  it('renders every row unpaginated when pageSize={0}', () => {
    const manyRows: Row[] = Array.from({ length: 30 }, (_, i) => ({ id: String(i), name: `Patient ${i}`, age: 30 }))
    render(<DataTable data={manyRows} columns={columns} getRowId={(r) => r.id} pageSize={0} />)
    expect(screen.getAllByRole('row')).toHaveLength(31)
  })
})
