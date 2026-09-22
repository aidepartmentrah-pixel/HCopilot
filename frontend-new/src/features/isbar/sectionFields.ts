import type { FieldPath } from 'react-hook-form'
import type { IsbarFormValues } from './schema'

export type SectionId = 'patient-arrival' | 'vitals' | 'situation' | 'background' | 'focused-assessment' | 'recommendation'

/**
 * Which top-level form fields belong to each section — drives per-section
 * validation on Continue (react-hook-form's `trigger(fields)`) and the
 * not-started/in-progress dirty-tracking. Mirrors exactly what each
 * Section component's own `register`/`name` calls use (checked directly
 * against PatientArrivalSection.tsx/VitalSignsSection.tsx/etc.) — this is
 * not a redeclaration of the schema, just a grouping of its existing keys.
 */
export const SECTION_FIELDS: Record<SectionId, FieldPath<IsbarFormValues>[]> = {
  'patient-arrival': ['name', 'gender', 'age', 'arrival_time', 'triage_time', 'chiefcomplaint', 'acuity'],
  vitals: [
    'temperature',
    'heartrate',
    'resprate',
    'o2sat',
    'sbp',
    'dbp',
    'pain',
    'isbar.blood_glucose',
    'isbar.o2_support',
    'isbar.o2_flow_rate',
    'isbar.vitals_recorded_by',
    'isbar.vitals_measured_at',
  ],
  situation: [
    'isbar.reason_for_admission',
    'isbar.current_diagnosis',
    'isbar.clinical_status',
    'isbar.immediate_concerns',
    'isbar.immediate_concerns_other',
  ],
  background: [
    'isbar.past_medical_history',
    'isbar.past_medical_history_other',
    'isbar.surgical_history_flag',
    'isbar.surgical_history_text',
    'isbar.allergies_status',
    'isbar.allergy_types',
    'isbar.allergy_substance',
    'isbar.allergy_reaction',
    'isbar.isolation_precautions',
    'isbar.high_alert_meds',
    'isbar.high_alert_meds_other',
    'isbar.recent_procedures',
    'isbar.recent_procedures_other',
    'isbar.recent_procedure_datetime',
  ],
  'focused-assessment': [
    'isbar.neuro_status',
    'isbar.diet',
    'isbar.swallow_assessment',
    'isbar.last_bowel_movement',
    'isbar.voiding',
    'isbar.intake_ml',
    'isbar.output_ml',
    'isbar.lines_tubes_drains',
    'isbar.critical_lab_results',
    'isbar.pending_labs',
    'isbar.pending_imaging',
  ],
  recommendation: [
    'isbar.nursing_priorities',
    'isbar.nursing_priorities_other',
    'isbar.meds_due_next_shift',
    'isbar.pending_medical_review',
    'isbar.consultations',
    'isbar.discharge_transfer_plan',
    'isbar.discharge_transfer_plan_other',
    'isbar.outstanding_tasks',
    'isbar.outstanding_tasks_other',
    'isbar.outgoing_nurse',
    'isbar.incoming_nurse',
    'isbar.handover_datetime',
    'isbar.receiver_ack',
  ],
}

export const SECTION_ORDER: SectionId[] = ['patient-arrival', 'vitals', 'situation', 'background', 'focused-assessment', 'recommendation']
