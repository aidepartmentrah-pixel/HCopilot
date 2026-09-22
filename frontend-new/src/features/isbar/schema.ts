import { z } from 'zod'

// Mirrors backend/features/patient_management/api.py's _PatientBase and
// ISBARDetails validators exactly — range checks, required-vs-optional,
// and the roster-origin relaxed-required rule. Don't add a rule here that
// the backend doesn't also enforce (§35's own instruction).

// Plain z.number().optional() — no preprocess/coerce/transform, so the
// resolver's input and output types stay identical (the classic
// zodResolver<Schema> "Resolver<Output> not assignable to Resolver<Input>"
// error otherwise). Empty-string-to-undefined conversion happens at the
// react-hook-form layer instead, via each numeric field's `setValueAs`
// (see numericFieldOptions in constants.ts) — Zod only ever sees a real
// number or undefined, never a raw string.
const numberOrEmpty = (schema: z.ZodNumber) => schema.optional()

export const isbarDetailsSchema = z.object({
  blood_glucose: numberOrEmpty(z.number()),
  o2_support: z.string().optional(),
  o2_flow_rate: numberOrEmpty(z.number()),
  vitals_measured_at: z.string().optional(),
  vitals_recorded_by: z.string().optional(),

  reason_for_admission: z.string().optional(),
  current_diagnosis: z.string().optional(),
  clinical_status: z.string().optional(),
  immediate_concerns: z.string().optional(),
  immediate_concerns_other: z.string().optional(),

  past_medical_history: z.string().optional(),
  past_medical_history_other: z.string().optional(),
  surgical_history_flag: z.string().optional(),
  surgical_history_text: z.string().optional(),
  allergies_status: z.string().optional(),
  allergy_types: z.string().optional(),
  allergy_substance: z.string().optional(),
  allergy_reaction: z.string().optional(),
  isolation_precautions: z.string().optional(),
  high_alert_meds: z.string().optional(),
  high_alert_meds_other: z.string().optional(),
  recent_procedures: z.string().optional(),
  recent_procedures_other: z.string().optional(),
  recent_procedure_datetime: z.string().optional(),

  neuro_status: z.string().optional(),
  telemetry: z.string().optional(),
  edema: z.string().optional(),
  peripheral_pulses: z.string().optional(),
  diet: z.string().optional(),
  npo: z.string().optional(),
  swallow_assessment: z.string().optional(),
  last_bowel_movement: z.string().optional(),
  voiding: z.string().optional(),
  urinary_catheter: z.string().optional(),
  wounds: z.string().optional(),
  fall_risk: z.string().optional(),
  pressure_injury_risk: z.string().optional(),
  mobility_aids: z.string().optional(),
  lines_tubes_drains: z.string().optional(),
  intake_ml: numberOrEmpty(z.number()),
  output_ml: numberOrEmpty(z.number()),
  critical_lab_results: z.string().optional(),
  pending_labs: z.string().optional(),
  pending_imaging: z.string().optional(),

  nursing_priorities: z.string().optional(),
  nursing_priorities_other: z.string().optional(),
  meds_due_next_shift: z.string().optional(),
  pending_medical_review: z.string().optional(),
  consultations: z.string().optional(),
  discharge_transfer_plan: z.string().optional(),
  discharge_transfer_plan_other: z.string().optional(),
  outstanding_tasks: z.string().optional(),
  outstanding_tasks_other: z.string().optional(),
  outgoing_nurse: z.string().optional(),
  incoming_nurse: z.string().optional(),
  handover_datetime: z.string().optional(),
  receiver_ack: z.boolean().optional(),
})

export const isbarFormSchema = z
  .object({
    patient_id: z.number().int().positive(),
    stay_id: z.number().int().positive(),
    name: z.string().trim().min(1, 'is required'),
    arrival_time: z.string().trim().min(1, 'is required'),
    gender: z.string().optional(),
    age: numberOrEmpty(z.number().min(0, 'must be a positive number')),
    chiefcomplaint: z.string().optional(),
    acuity: numberOrEmpty(z.number().min(1).max(5, 'expected between 1 (Immediate) and 5 (Non-Urgent)')),
    temperature: numberOrEmpty(z.number().min(26).max(46, 'expected between 26 and 46 °C')),
    heartrate: numberOrEmpty(z.number().min(20).max(300, 'expected between 20 and 300 bpm')),
    resprate: numberOrEmpty(z.number().min(4).max(100, 'expected between 4 and 100 breaths/min')),
    o2sat: numberOrEmpty(z.number().min(0).max(100, 'expected between 0 and 100 %')),
    sbp: numberOrEmpty(z.number().min(40).max(300, 'expected between 40 and 300 mmHg')),
    dbp: numberOrEmpty(z.number().min(20).max(200, 'expected between 20 and 200 mmHg')),
    pain: z.string().optional(),
    triage_time: z.string().optional(),
    record_source: z.enum(['local', 'external']).optional(),
    er_visit_id: z.string().optional(),
    external_patient_id: z.string().optional(),
    external_visit_id: z.string().optional(),
    isbar: isbarDetailsSchema,
  })
  .superRefine((data, ctx) => {
    const isRosterOrigin = data.record_source === 'external' && !!data.er_visit_id
    if (isRosterOrigin) return
    if (!data.gender?.trim()) ctx.addIssue({ code: 'custom', path: ['gender'], message: 'is required' })
    if (!data.chiefcomplaint?.trim()) ctx.addIssue({ code: 'custom', path: ['chiefcomplaint'], message: 'is required' })
    if (data.age === undefined) ctx.addIssue({ code: 'custom', path: ['age'], message: 'is required' })
    if (data.acuity === undefined) ctx.addIssue({ code: 'custom', path: ['acuity'], message: 'is required' })
  })

export type IsbarFormValues = z.infer<typeof isbarFormSchema>
