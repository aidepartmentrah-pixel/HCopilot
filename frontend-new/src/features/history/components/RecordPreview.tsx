import { ExternalLink, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { ErrorState } from '@/components/feedback/ErrorState'
import { LoadingState } from '@/components/feedback/LoadingState'
import { usePatientDetails } from '@/hooks/usePatients'
import { IsbarReadOnlySections } from './IsbarReadOnlySections'
import { PatientSummary } from './PatientSummary'
import styles from './RecordPreview.module.css'

interface RecordPreviewProps {
  stayId: number
  onClose: () => void
}

export function RecordPreview({ stayId, onClose }: RecordPreviewProps) {
  const { data: patient, isLoading, error, refetch } = usePatientDetails(stayId)

  if (isLoading) return <LoadingState label="Loading record…" />
  if (error || !patient) return <ErrorState description="Couldn't load this record." onRetry={() => refetch()} />

  return (
    <div className={styles.preview}>
      <div className={styles.closeRow}>
        <IconButton icon={<X size={16} />} label="Close preview" onClick={onClose} />
      </div>
      <PatientSummary patient={patient} />
      <IsbarReadOnlySections isbar={patient.isbar} defaultOpen="none" />
      <div className={styles.footer}>
        <Link to={`/history/${stayId}`}>
          <Button variant="secondary">
            <ExternalLink size={16} /> Open Full Record
          </Button>
        </Link>
      </div>
    </div>
  )
}
