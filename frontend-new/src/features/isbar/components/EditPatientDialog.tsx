import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { apiErrorMessage } from '@/api/client'
import { ErrorState } from '@/components/feedback/ErrorState'
import { LoadingState } from '@/components/feedback/LoadingState'
import { useToast } from '@/components/feedback/useToast'
import { IconButton } from '@/components/ui/IconButton'
import { useModifyPatient, usePatientDetails } from '@/hooks/usePatients'
import type { PatientDetails } from '@/types/patient'
import { formValuesToModifyInput, patientDetailsToFormValues } from '../mapping'
import { isbarFormSchema, type IsbarFormValues } from '../schema'
import { IsbarWorkspace } from './IsbarWorkspace'
import styles from './EditPatientDialog.module.css'

interface EditPatientDialogProps {
  /** The active stay to edit; null = closed. */
  stayId: number | null
  onClose: () => void
}

/**
 * Pop-up editor for a patient who is already in the ER: the same ISBAR form as
 * the entry page, opened in place (the ISBAR entry page only admits patients).
 * Native <dialog>: focus trap, Escape and backdrop for free.
 */
export function EditPatientDialog({ stayId, onClose }: EditPatientDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const open = stayId !== null

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    else if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby="edit-patient-title"
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClose={onClose}
    >
      {stayId !== null && <EditBody key={stayId} stayId={stayId} onClose={onClose} />}
    </dialog>
  )
}

function EditBody({ stayId, onClose }: { stayId: number; onClose: () => void }) {
  const { data, isLoading, error, refetch } = usePatientDetails(stayId)
  return (
    <div className={styles.shell}>
      <div className={styles.header}>
        <h2 id="edit-patient-title" className={styles.title}>
          Edit patient data
        </h2>
        <IconButton icon={<X size={18} />} label="Close" onClick={onClose} />
      </div>
      <div className={styles.body}>
        {isLoading && <LoadingState label="Loading patient…" />}
        {(error || (!isLoading && !data)) && <ErrorState description="Couldn't load this patient." onRetry={() => refetch()} />}
        {data && <EditForm key={data.stay_id} details={data} onClose={onClose} />}
      </div>
    </div>
  )
}

function EditForm({ details, onClose }: { details: PatientDetails; onClose: () => void }) {
  const { showToast } = useToast()
  const queryClient = useQueryClient()
  const modifyPatient = useModifyPatient()
  const methods = useForm<IsbarFormValues>({
    resolver: zodResolver(isbarFormSchema),
    defaultValues: patientDetailsToFormValues(details),
  })

  async function handleSubmit(values: IsbarFormValues) {
    try {
      await modifyPatient.mutateAsync({ stayId: details.stay_id, body: formValuesToModifyInput(values) })
      // Bed/waiting cards show the patient's name, age and gender — refresh the board too.
      queryClient.invalidateQueries({ queryKey: ['beds'] })
      showToast('Changes saved.', 'success')
      onClose()
    } catch (err) {
      showToast(apiErrorMessage(err, 'Could not save. Please check the form and try again.'), 'error')
    }
  }

  return (
    <IsbarWorkspace
      mode="active"
      resetKey={`edit-${details.stay_id}`}
      methods={methods}
      onSubmit={handleSubmit}
      isSaving={modifyPatient.isPending}
      embedded
    />
  )
}
