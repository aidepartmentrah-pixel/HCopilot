import { RefreshCw, Siren } from 'lucide-react'
import { IconButton } from '@/components/ui/IconButton'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/feedback/EmptyState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { LoadingState } from '@/components/feedback/LoadingState'
import { useErRoster } from '@/hooks/useErRoster'
import type { ErRosterItem } from '@/types/er'
import type { Patient } from '@/types/patient'
import styles from './LiveErRoster.module.css'

interface LiveErRosterProps {
  activePatients: Patient[]
  activeStayId: number | null
  onSelect: (item: ErRosterItem, existingStayId: number | null) => void
  onOpenFallback: () => void
}

export function LiveErRoster({ activePatients, activeStayId, onSelect, onOpenFallback }: LiveErRosterProps) {
  const { data, isLoading, error, refetch, isFetching } = useErRoster()

  const byVisitId = new Map(activePatients.filter((p) => p.er_visit_id).map((p) => [String(p.er_visit_id), p]))

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>Live ER Roster</h2>
          <p className={styles.subtitle}>Recently arrived patients</p>
        </div>
        <IconButton
          icon={<RefreshCw size={16} className={isFetching ? styles.spinning : undefined} />}
          label="Refresh roster"
          onClick={() => refetch()}
        />
      </div>

      <div className={styles.list}>
        {isLoading && <LoadingState label="Loading roster…" />}
        {error && <ErrorState description="Couldn't load the live ER roster." onRetry={() => refetch()} />}
        {data && data.status !== 'ok' && (
          <ErrorState
            title="Hospital Directory unavailable"
            description={data.message || 'The live ER roster is temporarily unreachable. Use manual entry below.'}
            onRetry={() => refetch()}
          />
        )}
        {data && data.status === 'ok' && data.items.length === 0 && (
          <EmptyState icon={<Siren size={24} />} title="No patients on the roster" description="Nothing currently in the live ER feed." />
        )}
        {data &&
          data.status === 'ok' &&
          data.items.map((item) => {
            const existing = byVisitId.get(String(item.er_visit_id))
            const isActive = !!existing && existing.stay_id === activeStayId
            const name = [item.first_name, item.father_name, item.last_name].filter(Boolean).join(' ') || 'Unnamed'
            return (
              <button
                key={item.er_visit_id}
                type="button"
                data-testid="er-roster-row"
                data-er-visit-id={item.er_visit_id}
                className={[styles.row, isActive ? styles.rowActive : ''].filter(Boolean).join(' ')}
                onClick={() => onSelect(item, existing?.stay_id ?? null)}
              >
                <div className={styles.rowTop}>
                  <span className={styles.rowName} dir="auto">
                    {name}
                  </span>
                  {existing && <Badge tone="brand">{isActive ? 'Selected' : 'In Progress'}</Badge>}
                </div>
                <div className={styles.rowMeta}>
                  {[item.age != null ? `${item.age}${item.gender ? item.gender[0] : ''}` : null, item.chief_complaint]
                    .filter(Boolean)
                    .join(' · ') || '—'}
                </div>
              </button>
            )
          })}
      </div>

      <button type="button" className={styles.fallback} onClick={onOpenFallback} aria-label="Can't find the patient? Open directory search or manual entry">
        Can't find the patient? <span className={styles.fallbackLink}>Search Directory · Enter Manually</span>
      </button>
    </div>
  )
}
