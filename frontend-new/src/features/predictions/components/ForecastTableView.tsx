import type { ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/tables/DataTable'
import type { ForecastPoint, HistoricalPoint } from '@/types/predictions'
import { formatForecastDate } from '../forecastChartData'
import styles from './ForecastTableView.module.css'

interface ForecastTableRow {
  date: string
  kind: 'Historical' | 'Forecast'
  patientCount: number
}

interface ForecastTableViewProps {
  historical: HistoricalPoint[]
  forecast: ForecastPoint[]
}

const columns: ColumnDef<ForecastTableRow, unknown>[] = [
  { accessorKey: 'date', header: 'Date', cell: ({ getValue }) => formatForecastDate(getValue<string>(), true) },
  {
    accessorKey: 'kind',
    header: 'Historical / Forecast',
    cell: ({ getValue }) => <span className={getValue<string>() === 'Forecast' ? styles.forecast : styles.historical}>{getValue<string>()}</span>,
  },
  { accessorKey: 'patientCount', header: 'Patient Count', cell: ({ getValue }) => Math.round(getValue<number>()) },
]

/** Table mode (§23) — exact values, reached through the chart's own view control, never the default. */
export function ForecastTableView({ historical, forecast }: ForecastTableViewProps) {
  const rows: ForecastTableRow[] = [
    ...historical.map((h): ForecastTableRow => ({ date: h.date, kind: 'Historical', patientCount: h.actual_patients })),
    ...forecast.map((f): ForecastTableRow => ({ date: f.date, kind: 'Forecast', patientCount: f.predicted_patients })),
  ]

  return (
    <DataTable
      data={rows}
      columns={columns}
      getRowId={(r) => `${r.kind}-${r.date}`}
      emptyTitle="No forecast data available."
      // Newest-first (forecast dates are chronologically latest) so the
      // forecast — this page's actual subject — is what page 1 shows,
      // rather than being paginated behind up to 90 historical rows.
      defaultSort={[{ id: 'date', desc: true }]}
    />
  )
}
