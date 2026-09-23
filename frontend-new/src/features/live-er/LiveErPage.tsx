import { RefreshCw } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/feedback/ConfirmDialog'
import { PageHeader } from '@/components/layout/PageHeader'
import { EmptyState } from '@/components/feedback/EmptyState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { LoadingState } from '@/components/feedback/LoadingState'
import { useToast } from '@/components/feedback/useToast'
import { useAssignBed, useBedlessPatients, useBeds } from '@/hooks/useBeds'
import type { Bed } from '@/types/bed'
import { PlacementDetailDrawer } from './components/PlacementDetailDrawer'
import { SummaryStatRow } from './components/SummaryStatRow'
import { WardLane } from './components/WardLane'
import { cardFromBed, cardFromBedless, type PlacementCardData } from './utils'
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
  const [selectedWaitingCard, setSelectedWaitingCard] = useState<PlacementCardData | null>(null)
  const [pendingAssignment, setPendingAssignment] = useState<{ waiting: PlacementCardData; bed: PlacementCardData } | null>(null)
  const { showToast } = useToast()
  const assignBed = useAssignBed()

  const wardLanes = useMemo(() => groupBedsByWard(bedsData?.beds ?? []), [bedsData])
  const waitingCards = useMemo(() => (bedlessData?.patients ?? []).map((p) => cardFromBedless(p)), [bedlessData])
  const waitingOverThresholdCount = useMemo(() => waitingCards.filter((c) => c.isWaitingOverThreshold).length, [waitingCards])

  const assignableBedIds = useMemo(() => {
    if (!selectedWaitingCard) return undefined
    const ids = new Set<string>()
    for (const { beds } of wardLanes) {
      for (const bed of beds) {
        if (bed.bed_status === 'Available') ids.add(`bed-${bed.bed_id}`)
      }
    }
    return ids
  }, [selectedWaitingCard, wardLanes])

  function refreshAll() {
    refetchBeds()
    refetchBedless()
  }

  /**
   * Selection + assignment flow (§22-§26): a waiting card click selects it
   * (offering available beds as assignment targets); re-clicking the
   * already-selected card opens its full detail drawer instead. An
   * available-bed click while a patient is selected asks for confirmation
   * before mutating; with nothing selected it opens an informational
   * drawer, never an immediate assignment. Occupied/under-repair beds
   * always open their own detail drawer.
   */
  function handleCardClick(card: PlacementCardData) {
    if (card.kind === 'waiting') {
      if (selectedWaitingCard?.id === card.id) {
        setSelectedWaitingCard(null)
        setSelectedCard(card)
      } else {
        setSelectedWaitingCard(card)
      }
      return
    }

    // card.kind === 'bed'
    if (card.bed?.bed_status === 'Available' && selectedWaitingCard) {
      setPendingAssignment({ waiting: selectedWaitingCard, bed: card })
      return
    }
    setSelectedWaitingCard(null)
    setSelectedCard(card)
  }

  async function confirmAssignment() {
    if (!pendingAssignment?.bed.bed || !pendingAssignment.waiting.patientId) return
    try {
      await assignBed.mutateAsync({ bedId: pendingAssignment.bed.bed.bed_id, patientId: pendingAssignment.waiting.patientId })
      showToast(`${pendingAssignment.waiting.primary} assigned to ${pendingAssignment.bed.primary}.`, 'success')
    } catch {
      showToast('Could not assign this bed.', 'error')
    } finally {
      setPendingAssignment(null)
      setSelectedWaitingCard(null)
    }
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

          {selectedWaitingCard && (
            <div className={styles.selectionHint} role="status">
              <strong dir="auto">{selectedWaitingCard.primary}</strong> selected — click an available bed to assign it, or click the
              patient again to view details.
            </div>
          )}

          {wardLanes.length === 0 && waitingCards.length === 0 ? (
            <EmptyState title="No beds configured" description="Add beds from Settings → Beds to see the live board." />
          ) : (
            <>
              {wardLanes.map(({ wardName, beds }) => (
                <WardLane
                  key={wardName}
                  title={wardName}
                  kind="bed"
                  cards={beds.map(cardFromBed)}
                  onCardClick={handleCardClick}
                  assignableBedIds={assignableBedIds}
                />
              ))}
              <WardLane
                title="Waiting / No Bed"
                kind="waiting"
                cards={waitingCards}
                onCardClick={handleCardClick}
                selectedCardId={selectedWaitingCard?.id}
              />
            </>
          )}
        </>
      )}

      <PlacementDetailDrawer card={selectedCard} onClose={() => setSelectedCard(null)} />

      <ConfirmDialog
        open={!!pendingAssignment}
        title="Assign bed"
        description={
          pendingAssignment
            ? `Assign ${pendingAssignment.waiting.primary} to ${pendingAssignment.bed.primary}?`
            : ''
        }
        confirmLabel="Assign"
        onConfirm={confirmAssignment}
        onCancel={() => setPendingAssignment(null)}
      />
    </>
  )
}
