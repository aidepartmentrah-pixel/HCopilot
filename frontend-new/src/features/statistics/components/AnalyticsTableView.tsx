import type { ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/tables/DataTable'
import type { ChartDatum } from '../chartData'

interface AnalyticsTableViewProps {
  data: ChartDatum[]
  total?: number
  valueLabel?: string
  valueFormatter?: (v: number) => string
}

/** Table mode (§29) — exact values, reusing HCopilot's standard table rather than a bespoke layout. Every chart's data is small (<=24 rows), so pagination is disabled. */
export function AnalyticsTableView({ data, total, valueLabel = 'Count', valueFormatter = String }: AnalyticsTableViewProps) {
  const columns: ColumnDef<ChartDatum, unknown>[] = [
    { header: 'Label', accessorKey: 'label', cell: (ctx) => <span dir="auto">{ctx.getValue<string>()}</span> },
    { header: valueLabel, accessorKey: 'value', cell: (ctx) => valueFormatter(ctx.getValue<number>()) },
    ...(total && total > 0
      ? [
          {
            header: '% of Documented',
            id: 'pct',
            accessorFn: (row: ChartDatum) => (row.value / total) * 100,
            cell: (ctx) => `${ctx.getValue<number>().toFixed(1)}%`,
          } satisfies ColumnDef<ChartDatum, unknown>,
        ]
      : []),
  ]

  return <DataTable data={data} columns={columns} getRowId={(row) => row.label} pageSize={0} emptyTitle="No data available for this period." />
}
