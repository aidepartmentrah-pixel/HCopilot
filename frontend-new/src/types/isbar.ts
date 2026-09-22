// Mirrors backend/features/patient_management/api.py's ISBARDetails model
// and its allow-list constants field-for-field. Every field is optional —
// the backend enforces no section-completeness rule (§ "Good Assumption
// Policy" — don't invent client-side validation that diverges from the
// server's). Multi-select fields are comma-separated strings on the wire,
// matching DailyPatient.bed_history's existing convention.

export const O2_SUPPORT_OPTIONS = [
  'room_air',
  'nasal_cannula',
  'simple_mask',
  'non_rebreather',
  'high_flow_nc',
  'cpap_bipap',
  'mechanical_vent',
] as const

export const CLINICAL_STATUS_OPTIONS = ['Stable', 'Improving', 'Close monitoring', 'Deteriorating', 'Critical'] as const

export const IMMEDIATE_CONCERNS_OPTIONS = [
  'respiratory_distress',
  'chest_pain',
  'fever_infection',
  'sepsis',
  'altered_loc',
  'active_bleeding',
  'uncontrolled_pain',
  'hypo_hyperglycemia',
  'other',
] as const

export const PAST_MEDICAL_HISTORY_OPTIONS = [
  'hypertension',
  'diabetes',
  'cad',
  'heart_failure',
  'stroke_tia',
  'ckd',
  'copd_asthma',
  'liver_disease',
  'cancer',
  'alzheimer',
  'other',
] as const

export const YES_NO_OPTIONS = ['Yes', 'No'] as const
export const ALLERGIES_STATUS_OPTIONS = ['Yes', 'No', 'NKA'] as const
export const ALLERGY_TYPES_OPTIONS = ['medication', 'food', 'latex', 'other'] as const
export const ISOLATION_OPTIONS = ['None', 'Contact', 'Droplet', 'Airborne', 'Reverse'] as const

export const HIGH_ALERT_MEDS_OPTIONS = [
  'insulin',
  'anticoagulants',
  'opioids',
  'sedatives',
  'vasoactive',
  'chemotherapy',
  'other',
] as const

export const RECENT_PROCEDURES_OPTIONS = [
  'surgery',
  'intubation',
  'central_picc',
  'chest_tube',
  'blood_transfusion',
  'dialysis',
  'endoscopy',
  'other',
] as const

export const NEURO_STATUS_OPTIONS = ['Alert', 'Oriented', 'Confused', 'Drowsy', 'Unresponsive'] as const
export const SWALLOW_OPTIONS = ['Passed', 'Failed', 'Pending'] as const
export const VOIDING_OPTIONS = ['Independent', 'Assisted'] as const

export const LINES_TUBES_OPTIONS = [
  'peripheral_iv',
  'central_line_picc',
  'urinary_catheter',
  'ng',
  'peg_tube',
  'chest_tube',
  'drain',
] as const

export const NURSING_PRIORITIES_OPTIONS = [
  'frequent_vitals',
  'continuous_spo2',
  'glucose_monitoring',
  'pain_reassessment',
  'neuro_checks',
  'wound_care',
  'io_monitoring',
  'fall_precautions',
  'pressure_injury_prevention',
  'isolation_precautions',
  'other',
] as const

export const DISCHARGE_PLAN_OPTIONS = ['home', 'ward', 'icu_hdu', 'or', 'rehab', 'other'] as const

export const OUTSTANDING_TASKS_OPTIONS = [
  'medication_admin',
  'blood_sampling',
  'imaging_transport',
  'dressing_change',
  'catheter_care',
  'patient_education',
  'physician_notification',
  'discharge_paperwork',
  'transfer_arrangements',
  'other',
] as const

export interface ISBARDetails {
  // Initial Vital Signs additions
  blood_glucose?: number | null
  o2_support?: string | null
  o2_flow_rate?: number | null
  vitals_measured_at?: string | null
  vitals_recorded_by?: string | null

  // Situation
  reason_for_admission?: string | null
  current_diagnosis?: string | null
  clinical_status?: string | null
  immediate_concerns?: string | null
  immediate_concerns_other?: string | null

  // Background
  past_medical_history?: string | null
  past_medical_history_other?: string | null
  surgical_history_flag?: string | null
  surgical_history_text?: string | null
  allergies_status?: string | null
  allergy_types?: string | null
  allergy_substance?: string | null
  allergy_reaction?: string | null
  isolation_precautions?: string | null
  high_alert_meds?: string | null
  high_alert_meds_other?: string | null
  recent_procedures?: string | null
  recent_procedures_other?: string | null
  recent_procedure_datetime?: string | null

  // Focused Assessment
  neuro_status?: string | null
  telemetry?: string | null
  edema?: string | null
  peripheral_pulses?: string | null
  diet?: string | null
  npo?: string | null
  swallow_assessment?: string | null
  last_bowel_movement?: string | null
  voiding?: string | null
  urinary_catheter?: string | null
  wounds?: string | null
  fall_risk?: string | null
  pressure_injury_risk?: string | null
  mobility_aids?: string | null
  lines_tubes_drains?: string | null
  intake_ml?: number | null
  output_ml?: number | null
  critical_lab_results?: string | null
  pending_labs?: string | null
  pending_imaging?: string | null

  // Recommendation & Handover
  nursing_priorities?: string | null
  nursing_priorities_other?: string | null
  meds_due_next_shift?: string | null
  pending_medical_review?: string | null
  consultations?: string | null
  discharge_transfer_plan?: string | null
  discharge_transfer_plan_other?: string | null
  outstanding_tasks?: string | null
  outstanding_tasks_other?: string | null
  outgoing_nurse?: string | null
  incoming_nurse?: string | null
  handover_datetime?: string | null
  receiver_ack?: boolean | null
}

/** The small badge subset merged into /patients/list and /log-patients/list rows (never the full record). */
export interface ISBARBadgeSubset {
  allergies_status?: string | null
  fall_risk?: string | null
  pressure_injury_risk?: string | null
  isolation_precautions?: string | null
  clinical_status?: string | null
}
