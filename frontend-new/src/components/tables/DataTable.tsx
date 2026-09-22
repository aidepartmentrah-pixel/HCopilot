import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ArrowUpDown } from 'lucide-react'
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table'
import { useState } from 'react'
import { IconButton } from '../ui/IconButton'
import { EmptyState } from '../feedback/EmptyState'
import { ErrorState } from '../feedback/ErrorState'
import { LoadingState } from '../feedback/LoadingState'
import styles from './DataTable.module.css'

interface DataTableProps<T> {
  data: T[]
  columns: ColumnDef<T, unknown>[]
  getRowId: (row: T) => string
  isLoading?: boolean
  error?: string | null
  onRetry?: () => void
  emptyTitle?: string
  emptyDescription?: string
  onRowClick?: (row: T) => void
  selectedRowId?: string | null
  /** Rows per page (§15 — pagination is a required table feature). Set 0 to disable for a page that genuinely needs every row visible at once. */
  pageSize?: number
  /** Initial sort — defaults to insertion order otherwise, which buries a just-created row on a later page instead of page 1. */
  defaultSort?: SortingState
}

/**
 * Reusable table (§15): sticky header, sortable columns, loading/empty/
 * error states, selected-row highlight. Built on TanStack Table's headless
 * core rather than a full pre-styled table library, per §3.
 */
export function DataTable<T>({
  data,
  columns,
  getRowId,
  isLoading,
  error,
  onRetry,
  emptyTitle = 'No records found',
  emptyDescription,
  onRowClick,
  selectedRowId,
  pageSize = 20,
  defaultSort,
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>(defaultSort ?? [])
  const paginated = pageSize > 0

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    ...(paginated && {
      getPaginationRowModel: getPaginationRowModel(),
      initialState: { pagination: { pageSize } },
    }),
    getRowId: (row) => getRowId(row),
  })

  if (isLoading) return <LoadingState label="Loading records…" />
  if (error) return <ErrorState description={error} onRetry={onRetry} />
  if (data.length === 0) return <EmptyState title={emptyTitle} description={emptyDescription} />

  const pageCount = table.getPageCount()
  const pageIndex = table.getState().pagination.pageIndex

  return (
    <div className={styles.tableWrapper}>
      <table className={styles.table}>
        <thead className={styles.thead}>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const sortState = header.column.getIsSorted()
                const canSort = header.column.getCanSort()
                return (
                  <th
                    key={header.id}
                    className={styles.th}
                    aria-sort={sortState === 'asc' ? 'ascending' : sortState === 'desc' ? 'descending' : 'none'}
                  >
                    {header.isPlaceholder ? null : canSort ? (
                      <button
                        type="button"
                        className={styles.sortButton}
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {sortState === 'asc' && <ArrowUp size={14} aria-hidden="true" />}
                        {sortState === 'desc' && <ArrowDown size={14} aria-hidden="true" />}
                        {!sortState && <ArrowUpDown size={14} className={styles.sortIconIdle} aria-hidden="true" />}
                      </button>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                  </th>
                )
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr
              key={row.id}
              className={[styles.tr, onRowClick ? styles.clickable : '', row.id === selectedRowId ? styles.selected : '']
                .filter(Boolean)
                .join(' ')}
              onClick={() => onRowClick?.(row.original)}
              tabIndex={onRowClick ? 0 : undefined}
              onKeyDown={(e) => {
                if (onRowClick && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault()
                  onRowClick(row.original)
                }
              }}
              aria-selected={row.id === selectedRowId || undefined}
            >
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className={styles.td}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {paginated && pageCount > 1 && (
        <div className={styles.pagination}>
          <span className={styles.pageInfo}>
            Page {pageIndex + 1} of {pageCount} ({data.length} total)
          </span>
          <div className={styles.pageButtons}>
            <IconButton
              icon={<ArrowLeft size={16} />}
              label="Previous page"
              size="sm"
              disabled={!table.getCanPreviousPage()}
              onClick={() => table.previousPage()}
            />
            <IconButton
              icon={<ArrowRight size={16} />}
              label="Next page"
              size="sm"
              disabled={!table.getCanNextPage()}
              onClick={() => table.nextPage()}
            />
          </div>
        </div>
      )}
    </div>
  )
}
