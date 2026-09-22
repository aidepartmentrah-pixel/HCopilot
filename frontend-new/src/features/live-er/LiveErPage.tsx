import { RefreshCw } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/layout/PageHeader'
import { EmptyState } from '@/components/feedback/EmptyState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { LoadingState } from '@/components/feedback/LoadingState'
import { useBedlessPatients, useBeds } from '@/hooks/useBeds'
import type { Bed } from '@/types/bed'
import { PlacementDetailDialog } from './components/PlacementDetailDialog'
import { SummaryStatRow } from './components/SummaryStatRow'
import { WardLane } from './components/WardLane'
import { cardFromBed, cardFromBedless, isWaitingOverThreshold, type PlacementCardData } from './utils'
import styles from './LiveErPage.module.css'

const UNASSIGNED_WARD_LABEL = 'Unassigned'

function groupBedsByWard(beds: Bed[]): { wardName: string; beds: Bed[] }[] {
  const groups = new Map<string, Bed[]>()
  for (const bed of beds) {
    const key = bed.ward_name ?? UNASSIGNED_WARD_LABEL
    const list = groups.get(key) ?? []
    list.push(bed)
    groups.set(key, list)
  }
  return Array.from(groups.entries())
    .sort(([a], [b]) => (a === UNASSIGNED_WARD_LABEL ? 1 : b === UNASSIGNED_WARD_LABEL ? -1 : a.localeCompare(b)))
    .map(([wardName, wardBeds]) => ({ wardName, beds: wardBeds }))
}

export function LiveErPage() {
  const { data: bedsData, isLoading: bedsLoading, error: bedsError, refetch: refetchBeds, isFetching: bedsFetching } = useBeds()
  const { data: bedlessData, isLoading: bedlessLoading, error: bedlessError, refetch: refetchBedless } = useBedlessPatients()
  const [selectedCard, setSelectedCard] = useState<PlacementCardData | null>(null)

  const wardLanes = useMemo(() => groupBedsByWard(bedsData?.beds ?? []), [bedsData])
  const waitingCards = useMemo(() => (bedlessData?.patients ?? []).map(cardFromBedless), [bedlessData])
  const waitingOverThresholdCount = useMemo(
    () => (bedlessData?.patients ?? []).filter((p) => isWaitingOverThreshold(p.arrival_time, p.triage_time)).length,
    [bedlessData],
  )

  function refreshAll() {
    refetchBeds()
    refetchBedless()
  }

  const isLoading = bedsLoading || bedlessLoading
  const error = bedsError || bedlessError

  return (
    <>
      <PageHeader
        title="Live ER"
        subtitle="Monitor current patient placement"
        actions={
          <Button variant="secondary" onClick={refreshAll} disabled={bedsFetching}>
            <RefreshCw size={16} className={bedsFetching ? styles.spinning : undefined} /> Refresh
          </Button>
        }
      />

      {isLoading && <LoadingState label="Loading the live board…" />}
      {error && <ErrorState description="Couldn't load the live ER board." onRetry={refreshAll} />}

      {!isLoading && !error && bedsData && (
        <>
          <SummaryStatRow
            occupied={bedsData.status_summary.Occupied ?? 0}
            available={bedsData.status_summary.Available ?? 0}
            withoutBed={bedlessData?.total ?? 0}
            waitingOverThreshold={waitingOverThresholdCount}
          />

          {wardLanes.length === 0 && waitingCards.length === 0 ? (
            <EmptyState title="No beds configured" description="Add beds from Settings → Beds to see the live board." />
          ) : (
            <>
              {wardLanes.map(({ wardName, beds }) => (
                <WardLane key={wardName} title={wardName} cards={beds.map(cardFromBed)} onCardClick={setSelectedCard} />
              ))}
              <WardLane title="Waiting / No Bed" cards={waitingCards} onCardClick={setSelectedCard} />
            </>
          )}
        </>
      )}

      <PlacementDetailDialog
        card={selectedCard}
        waitingPatients={bedlessData?.patients ?? []}
        onClose={() => setSelectedCard(null)}
      />
    </>
  )
}
