import { ArrowLeft, Printer } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { ErrorState } from '@/components/feedback/ErrorState'
import { LoadingState } from '@/components/feedback/LoadingState'
import { usePatientDetails } from '@/hooks/usePatients'
import { IsbarReadOnlySections } from './components/IsbarReadOnlySections'
import { PatientSummary } from './components/PatientSummary'
import styles from './FullRecordPage.module.css'

/**
 * Deep review/print/export/edit live here, not on the preview pane
 * (confirmed decision #10) — Export PDF reuses the same window.print()
 * call as Print (browsers' print dialogs offer "Save as PDF" natively),
 * a deliberate scope choice over a PDF-generation dependency for a
 * second, functionally identical export path.
 */
export function FullRecordPage() {
  const { stayId } = useParams<{ stayId: string }>()
  const numericStayId = stayId ? Number(stayId) : null
  const { data: patient, isLoading, error, refetch } = usePatientDetails(numericStayId)

  return (
    <div className={styles.page}>
      <div className={styles.noPrint}>
        <PageHeader
          title="Full Record"
          subtitle={patient ? `Stay #${patient.stay_id}` : undefined}
          actions={
            <>
              <Link to="/history">
                <Button variant="secondary">
                  <ArrowLeft size={16} /> Back to History
                </Button>
              </Link>
              <Button onClick={() => window.print()} disabled={!patient}>
                <Printer size={16} /> Print / Export PDF
              </Button>
            </>
          }
        />
      </div>

      {isLoading && <LoadingState label="Loading record…" />}
      {(error || (!isLoading && !patient)) && (
        <ErrorState description="Couldn't load this record." onRetry={() => refetch()} />
      )}
      {patient && (
        <div className={styles.record}>
          <PatientSummary patient={patient} />
          <IsbarReadOnlySections isbar={patient.isbar} defaultOpen="all" />
        </div>
      )}
    </div>
  )
}
