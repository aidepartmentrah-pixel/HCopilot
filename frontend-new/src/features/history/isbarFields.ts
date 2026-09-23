import type { ISBARDetails } from '@/types/isbar'
import { humanize } from '@/utils/humanize'

export function humanizeList(value: string | null | undefined): string | null {
  if (!value) return null
  const tokens = value
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
  return tokens.length ? tokens.map(humanize).join(', ') : null
}

export interface FieldSpec {
  label: string
  value: string | null | undefined
  multi?: boolean
}

export type RecordedStatus = 'recorded' | 'partially-recorded' | 'not-recorded'

/** Derived only from which fields actually have a value — never inferred from anything else (History spec §26). */
export function sectionRecordedStatus(fields: FieldSpec[]): RecordedStatus {
  const populated = fields.filter((f) => f.value).length
  if (populated === 0) return 'not-recorded'
  if (populated === fields.length) return 'recorded'
  return 'partially-recorded'
}

export function vitalsFields(isbar: ISBARDetails | null | undefined): FieldSpec[] {
  return [
    { label: 'Blood Glucose', value: isbar?.blood_glucose != null ? `${isbar.blood_glucose} mg/dL` : null },
    { label: 'O2 Support', value: isbar?.o2_support ? humanize(isbar.o2_support) : null },
    { label: 'O2 Flow Rate', value: isbar?.o2_flow_rate != null ? `${isbar.o2_flow_rate} L/min` : null },
    { label: 'Vitals Recorded By', value: isbar?.vitals_recorded_by },
    { label: 'Vitals Measured At', value: isbar?.vitals_measured_at },
  ]
}

export function situationFields(isbar: ISBARDetails | null | undefined): FieldSpec[] {
  return [
    { label: 'Reason for Admission', value: isbar?.reason_for_admission },
    { label: 'Current Diagnosis', value: isbar?.current_diagnosis },
    { label: 'Clinical Status', value: isbar?.clinical_status },
    { label: 'Immediate Concerns', value: isbar?.immediate_concerns, multi: true },
    { label: 'Other Immediate Concern', value: isbar?.immediate_concerns_other },
  ]
}

export function backgroundFields(isbar: ISBARDetails | null | undefined): FieldSpec[] {
  return [
    { label: 'Past Medical History', value: isbar?.past_medical_history, multi: true },
    { label: 'Other Past Medical History', value: isbar?.past_medical_history_other },
    { label: 'Surgical History', value: isbar?.surgical_history_flag },
    { label: 'Surgical History Details', value: isbar?.surgical_history_text },
    { label: 'Allergies', value: isbar?.allergies_status },
    { label: 'Allergy Types', value: isbar?.allergy_types, multi: true },
    { label: 'Allergy Substance', value: isbar?.allergy_substance },
    { label: 'Allergy Reaction', value: isbar?.allergy_reaction },
    { label: 'Isolation Precautions', value: isbar?.isolation_precautions },
    { label: 'High-Alert Medications', value: isbar?.high_alert_meds, multi: true },
    { label: 'Recent Procedures', value: isbar?.recent_procedures, multi: true },
    { label: 'Recent Procedure Date/Time', value: isbar?.recent_procedure_datetime },
  ]
}

export function focusedAssessmentFields(isbar: ISBARDetails | null | undefined): FieldSpec[] {
  return [
    { label: 'Neuro Status', value: isbar?.neuro_status },
    { label: 'Telemetry', value: isbar?.telemetry },
    { label: 'Edema', value: isbar?.edema },
    { label: 'Peripheral Pulses', value: isbar?.peripheral_pulses },
    { label: 'Diet', value: isbar?.diet },
    { label: 'NPO', value: isbar?.npo },
    { label: 'Swallow Assessment', value: isbar?.swallow_assessment },
    { label: 'Last Bowel Movement', value: isbar?.last_bowel_movement },
    { label: 'Voiding', value: isbar?.voiding },
    { label: 'Urinary Catheter', value: isbar?.urinary_catheter },
    { label: 'Wounds', value: isbar?.wounds },
    { label: 'Fall Risk', value: isbar?.fall_risk },
    { label: 'Pressure Injury Risk', value: isbar?.pressure_injury_risk },
    { label: 'Mobility Aids', value: isbar?.mobility_aids },
    { label: 'Lines / Tubes / Drains', value: isbar?.lines_tubes_drains, multi: true },
    { label: 'Intake', value: isbar?.intake_ml != null ? `${isbar.intake_ml} mL` : null },
    { label: 'Output', value: isbar?.output_ml != null ? `${isbar.output_ml} mL` : null },
    { label: 'Critical Lab Results', value: isbar?.critical_lab_results },
    { label: 'Pending Labs', value: isbar?.pending_labs },
    { label: 'Pending Imaging', value: isbar?.pending_imaging },
  ]
}

export function recommendationFields(isbar: ISBARDetails | null | undefined): FieldSpec[] {
  return [
    { label: 'Nursing Priorities', value: isbar?.nursing_priorities, multi: true },
    { label: 'Other Nursing Priority', value: isbar?.nursing_priorities_other },
    { label: 'Medications Due Next Shift', value: isbar?.meds_due_next_shift },
    { label: 'Pending Medical Review', value: isbar?.pending_medical_review },
    { label: 'Consultations', value: isbar?.consultations },
    { label: 'Discharge / Transfer Plan', value: isbar?.discharge_transfer_plan ? humanize(isbar.discharge_transfer_plan) : null },
    { label: 'Other Discharge/Transfer Plan', value: isbar?.discharge_transfer_plan_other },
    { label: 'Outstanding Tasks', value: isbar?.outstanding_tasks, multi: true },
    { label: 'Other Outstanding Task', value: isbar?.outstanding_tasks_other },
    { label: 'Outgoing Nurse', value: isbar?.outgoing_nurse },
    { label: 'Incoming Nurse', value: isbar?.incoming_nurse },
    { label: 'Handover Date/Time', value: isbar?.handover_datetime },
    { label: 'Receiver Acknowledged', value: isbar?.receiver_ack ? 'Yes' : null },
  ]
}
