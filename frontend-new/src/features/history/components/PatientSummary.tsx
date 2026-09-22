import { StatusBadge } from '@/components/ui/StatusBadge'
import { ACUITY_TONE } from '@/features/isbar/constants'
import type { PatientDetails } from '@/types/patient'
import styles from './PatientSummary.module.css'

export function PatientSummary({ patient }: { patient: PatientDetails }) {
  return (
    <div className={styles.summary}>
      <div className={styles.nameRow}>
        <h2 className={styles.name} dir="auto">
          {patient.name || `Patient #${patient.patient_id}`}
        </h2>
        {patient.acuity != null && <StatusBadge label={`ESI ${patient.acuity}`} tone={ACUITY_TONE[patient.acuity] ?? 'neutral'} />}
      </div>
      <dl className={styles.grid}>
        <Field label="Patient #" value={String(patient.patient_id)} />
        <Field label="Stay #" value={String(patient.stay_id)} />
        <Field label="Age / Gender" value={[patient.age != null ? `${patient.age}y` : null, patient.gender].filter(Boolean).join(' · ')} />
        <Field label="Arrival" value={patient.arrival_time} />
        <Field label="Departure" value={patient.departure_time} />
        <Field label="Bed(s)" value={patient.bed_history} />
        <Field label="Ward" value={patient.admission_ward_name} />
        <Field label="Destination" value={patient.destination} />
        <Field label="Chief Complaint" value={patient.chiefcomplaint} />
      </dl>
    </div>
  )
}

function Field({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null
  return (
    <div className={styles.field}>
      <dt className={styles.label}>{label}</dt>
      <dd className={styles.value} dir="auto">
        {value}
      </dd>
    </div>
  )
}
