// patient-isbar-fields.js — centralized ISBAR field metadata.
//
// Single source of truth for the four metadata-driven accordion sections
// (Situation / Background / Focused Assessment / Recommendation & Handover).
// Patient & Arrival and Initial Vital Signs stay hand-written in index.html
// (they need compact, presentation-specific controls: combined BP, 0-10 pain
// buttons, conditional O2 flow rate) — see patient-isbar-form.js for how
// those two sections' values are merged in alongside the fields described here.
//
// Every `id` here matches the backend's ISBARDetails field name exactly (see
// backend/features/patient_management/api.py) — no translation layer needed
// between the form state, the JSON payload, and the read-only details view.
// `options` values for select/checkbox-group fields match the backend's
// fixed allow-lists exactly; changing an option here without updating the
// backend allow-list (or vice versa) will cause 422s or silently-unmatched
// display labels.

const ISBAR_METADATA_SECTIONS = [
  {
    id: 'situation',
    title: 'Situation',
    icon: '📋',
    fields: [
      { id: 'reason_for_admission', label: 'Reason for Admission', type: 'textarea', requiredTier: 'optional' },
      { id: 'current_diagnosis', label: 'Current Diagnosis', type: 'textarea', requiredTier: 'optional' },
      {
        id: 'clinical_status', label: 'Current Clinical Status', type: 'radio-group', requiredTier: 'optional',
        options: ['Stable', 'Improving', 'Close monitoring', 'Deteriorating', 'Critical'],
      },
      {
        id: 'immediate_concerns', label: 'Current Immediate Concerns', type: 'checkbox-group', requiredTier: 'optional',
        options: [
          { value: 'respiratory_distress', label: 'Respiratory distress' },
          { value: 'chest_pain', label: 'Chest pain' },
          { value: 'fever_infection', label: 'Fever / suspected infection' },
          { value: 'sepsis', label: 'Sepsis' },
          { value: 'altered_loc', label: 'Altered level of consciousness' },
          { value: 'active_bleeding', label: 'Active bleeding' },
          { value: 'uncontrolled_pain', label: 'Uncontrolled pain' },
          { value: 'hypo_hyperglycemia', label: 'Hypoglycemia / Hyperglycemia' },
          { value: 'other', label: 'Other' },
        ],
      },
      {
        id: 'immediate_concerns_other', label: 'Other concern (specify)', type: 'text', requiredTier: 'conditional',
        conditionalOn: { field: 'immediate_concerns', includes: 'other' },
      },
    ],
  },
  {
    id: 'background',
    title: 'Background',
    icon: '📖',
    fields: [
      {
        id: 'past_medical_history', label: 'Past Medical History', type: 'checkbox-group', requiredTier: 'optional',
        options: [
          { value: 'hypertension', label: 'Hypertension' },
          { value: 'diabetes', label: 'Diabetes' },
          { value: 'cad', label: 'Coronary Artery Disease' },
          { value: 'heart_failure', label: 'Heart Failure' },
          { value: 'stroke_tia', label: 'Stroke / TIA' },
          { value: 'ckd', label: 'Chronic Kidney Disease' },
          { value: 'copd_asthma', label: 'COPD / Asthma' },
          { value: 'liver_disease', label: 'Liver Disease' },
          { value: 'cancer', label: 'Cancer' },
          { value: 'alzheimer', label: 'Alzheimer' },
          { value: 'other', label: 'Other' },
        ],
      },
      {
        id: 'past_medical_history_other', label: 'Other history (specify)', type: 'text', requiredTier: 'conditional',
        conditionalOn: { field: 'past_medical_history', includes: 'other' },
      },
      {
        id: 'surgical_history_flag', label: 'Surgical / Procedure History', type: 'radio-group', requiredTier: 'optional',
        options: ['Yes', 'No'],
      },
      {
        id: 'surgical_history_text', label: 'Surgical history details', type: 'textarea', requiredTier: 'conditional',
        conditionalOn: { field: 'surgical_history_flag', equals: 'Yes' },
      },
      {
        id: 'allergies_status', label: 'Allergies', type: 'radio-group', requiredTier: 'optional',
        options: ['Yes', 'No', 'NKA'],
        optionLabels: { NKA: 'No known allergies' },
      },
      {
        id: 'allergy_types', label: 'Allergy Type', type: 'checkbox-group', requiredTier: 'conditional',
        conditionalOn: { field: 'allergies_status', equals: 'Yes' },
        options: [
          { value: 'medication', label: 'Medication' },
          { value: 'food', label: 'Food' },
          { value: 'latex', label: 'Latex' },
          { value: 'other', label: 'Other' },
        ],
      },
      {
        id: 'allergy_substance', label: 'Substance', type: 'text', requiredTier: 'conditional',
        conditionalOn: { field: 'allergies_status', equals: 'Yes' },
      },
      {
        id: 'allergy_reaction', label: 'Reaction', type: 'text', requiredTier: 'conditional',
        conditionalOn: { field: 'allergies_status', equals: 'Yes' },
      },
      {
        id: 'isolation_precautions', label: 'Isolation Precautions', type: 'radio-group', requiredTier: 'optional',
        options: ['None', 'Contact', 'Droplet', 'Airborne', 'Reverse'],
      },
      {
        id: 'high_alert_meds', label: 'Current High-Alert Medications', type: 'checkbox-group', requiredTier: 'optional',
        options: [
          { value: 'insulin', label: 'Insulin' },
          { value: 'anticoagulants', label: 'Anticoagulants' },
          { value: 'opioids', label: 'Opioids' },
          { value: 'sedatives', label: 'Sedatives' },
          { value: 'vasoactive', label: 'Vasoactive medications' },
          { value: 'chemotherapy', label: 'Chemotherapy' },
          { value: 'other', label: 'Other' },
        ],
      },
      {
        id: 'high_alert_meds_other', label: 'Other medication (specify)', type: 'text', requiredTier: 'conditional',
        conditionalOn: { field: 'high_alert_meds', includes: 'other' },
      },
      {
        id: 'recent_procedures', label: 'Recent Procedures / Events (last 24-48h)', type: 'checkbox-group', requiredTier: 'optional',
        options: [
          { value: 'surgery', label: 'Surgery' },
          { value: 'intubation', label: 'Intubation' },
          { value: 'central_picc', label: 'Central/PICC line insertion' },
          { value: 'chest_tube', label: 'Chest tube insertion' },
          { value: 'blood_transfusion', label: 'Blood transfusion' },
          { value: 'dialysis', label: 'Dialysis' },
          { value: 'endoscopy', label: 'Endoscopy' },
          { value: 'other', label: 'Other' },
        ],
      },
      {
        id: 'recent_procedures_other', label: 'Other procedure (specify)', type: 'text', requiredTier: 'conditional',
        conditionalOn: { field: 'recent_procedures', includes: 'other' },
      },
      {
        id: 'recent_procedure_datetime', label: 'Procedure/Event Date & Time', type: 'datetime', requiredTier: 'conditional',
        conditionalOn: { field: 'recent_procedures', notEmpty: true },
      },
    ],
  },
  {
    id: 'focused',
    title: 'Focused Assessment',
    icon: '🩺',
    subheadings: {
      neuro_status: 'Neurological',
      diet: 'Gastrointestinal',
      voiding: 'Genitourinary',
      fall_risk: 'Skin, Mobility & Risks',
      lines_tubes_drains: 'Lines, Tubes, Drains & Intake/Output',
      critical_lab_results: 'Laboratory & Diagnostics',
    },
    fields: [
      { id: 'neuro_status', label: 'Neurological Status', type: 'radio-group', requiredTier: 'optional',
        options: ['Alert', 'Oriented', 'Confused', 'Drowsy', 'Unresponsive'] },
      { id: 'telemetry', label: 'Telemetry', type: 'radio-group', requiredTier: 'optional', options: ['Yes', 'No'] },
      { id: 'edema', label: 'Edema', type: 'radio-group', requiredTier: 'optional', options: ['Yes', 'No'] },
      { id: 'peripheral_pulses', label: 'Peripheral Pulses', type: 'radio-group', requiredTier: 'optional', options: ['Yes', 'No'] },

      { id: 'diet', label: 'Diet', type: 'text', requiredTier: 'optional' },
      { id: 'npo', label: 'NPO', type: 'radio-group', requiredTier: 'optional', options: ['Yes', 'No'] },
      { id: 'swallow_assessment', label: 'Swallow Assessment', type: 'radio-group', requiredTier: 'optional',
        options: ['Passed', 'Failed', 'Pending'] },
      { id: 'last_bowel_movement', label: 'Last Bowel Movement', type: 'text', requiredTier: 'optional' },

      { id: 'voiding', label: 'Voiding', type: 'radio-group', requiredTier: 'optional', options: ['Independent', 'Assisted'] },
      { id: 'urinary_catheter', label: 'Urinary Catheter', type: 'radio-group', requiredTier: 'optional', options: ['Yes', 'No'] },
      { id: 'wounds', label: 'Wounds', type: 'radio-group', requiredTier: 'optional', options: ['Yes', 'No'] },

      { id: 'fall_risk', label: 'Fall Risk', type: 'radio-group', requiredTier: 'optional', options: ['Yes', 'No'] },
      { id: 'pressure_injury_risk', label: 'Pressure-Injury / Bed-Sore Risk', type: 'radio-group', requiredTier: 'optional', options: ['Yes', 'No'] },
      { id: 'mobility_aids', label: 'Mobility Aids', type: 'radio-group', requiredTier: 'optional', options: ['Yes', 'No'] },

      {
        id: 'lines_tubes_drains', label: 'Lines / Tubes / Drains', type: 'checkbox-group', requiredTier: 'optional',
        options: [
          { value: 'peripheral_iv', label: 'Peripheral IV' },
          { value: 'central_line_picc', label: 'Central Line / PICC' },
          { value: 'urinary_catheter', label: 'Urinary Catheter' },
          { value: 'ng', label: 'NG' },
          { value: 'peg_tube', label: 'PEG Tube' },
          { value: 'chest_tube', label: 'Chest Tube' },
          { value: 'drain', label: 'Drain' },
        ],
      },
      { id: 'intake_ml', label: 'Intake (last shift)', type: 'number', unit: 'mL', requiredTier: 'optional' },
      { id: 'output_ml', label: 'Output (last shift)', type: 'number', unit: 'mL', requiredTier: 'optional' },

      { id: 'critical_lab_results', label: 'Critical / Abnormal Diagnostic Results', type: 'textarea', requiredTier: 'optional' },
      { id: 'pending_labs', label: 'Pending Laboratory Tests', type: 'textarea', requiredTier: 'optional' },
      { id: 'pending_imaging', label: 'Pending Imaging / Procedures', type: 'textarea', requiredTier: 'optional' },
    ],
  },
  {
    id: 'recommendation',
    title: 'Recommendation & Handover',
    icon: '🤝',
    fields: [
      {
        id: 'nursing_priorities', label: 'Nursing Priorities for Next Shift', type: 'checkbox-group', requiredTier: 'optional',
        options: [
          { value: 'frequent_vitals', label: 'Frequent vital signs' },
          { value: 'continuous_spo2', label: 'Continuous SpO₂ monitoring' },
          { value: 'glucose_monitoring', label: 'Blood glucose monitoring' },
          { value: 'pain_reassessment', label: 'Pain reassessment' },
          { value: 'neuro_checks', label: 'Neurological checks' },
          { value: 'wound_care', label: 'Wound / dressing care' },
          { value: 'io_monitoring', label: 'Intake & output monitoring' },
          { value: 'fall_precautions', label: 'Fall precautions' },
          { value: 'pressure_injury_prevention', label: 'Pressure injury prevention' },
          { value: 'isolation_precautions', label: 'Isolation precautions' },
          { value: 'other', label: 'Other' },
        ],
      },
      {
        id: 'nursing_priorities_other', label: 'Other priority (specify)', type: 'text', requiredTier: 'conditional',
        conditionalOn: { field: 'nursing_priorities', includes: 'other' },
      },
      { id: 'meds_due_next_shift', label: 'Medications Due During Next Shift', type: 'textarea', requiredTier: 'optional' },
      { id: 'pending_medical_review', label: 'Pending Medical Review', type: 'textarea', requiredTier: 'optional' },
      { id: 'consultations', label: 'Consultations', type: 'textarea', requiredTier: 'optional' },
      {
        id: 'discharge_transfer_plan', label: 'Discharge / Transfer Plan', type: 'radio-group', requiredTier: 'optional',
        options: [
          { value: 'home', label: 'Home' },
          { value: 'ward', label: 'Ward admission' },
          { value: 'icu_hdu', label: 'ICU / HDU' },
          { value: 'or', label: 'Operating room' },
          { value: 'rehab', label: 'Rehabilitation' },
          { value: 'other', label: 'Other' },
        ],
      },
      {
        id: 'discharge_transfer_plan_other', label: 'Other plan (specify)', type: 'text', requiredTier: 'conditional',
        conditionalOn: { field: 'discharge_transfer_plan', equals: 'other' },
      },
      {
        id: 'outstanding_tasks', label: 'Outstanding Tasks / To-Do', type: 'checkbox-group', requiredTier: 'optional',
        options: [
          { value: 'medication_admin', label: 'Medication administration' },
          { value: 'blood_sampling', label: 'Blood sampling' },
          { value: 'imaging_transport', label: 'Imaging transport' },
          { value: 'dressing_change', label: 'Dressing change' },
          { value: 'catheter_care', label: 'Catheter care' },
          { value: 'patient_education', label: 'Patient / family education' },
          { value: 'physician_notification', label: 'Physician notification' },
          { value: 'discharge_paperwork', label: 'Discharge paperwork' },
          { value: 'transfer_arrangements', label: 'Transfer arrangements' },
          { value: 'other', label: 'Other' },
        ],
      },
      {
        id: 'outstanding_tasks_other', label: 'Other task (specify)', type: 'text', requiredTier: 'conditional',
        conditionalOn: { field: 'outstanding_tasks', includes: 'other' },
      },
      { id: 'outgoing_nurse', label: 'Outgoing Nurse', type: 'text', requiredTier: 'optional', autofillFrom: 'currentUser' },
      { id: 'incoming_nurse', label: 'Incoming Nurse', type: 'text', requiredTier: 'optional' },
      { id: 'handover_datetime', label: 'Handover Date/Time', type: 'datetime', requiredTier: 'optional' },
      { id: 'receiver_ack', label: 'Receiver has acknowledged this handover', type: 'boolean', requiredTier: 'optional' },
    ],
  },
];

// Flat lookup of every metadata-driven field by id, for the validator.
const ISBAR_FIELD_BY_ID = {};
ISBAR_METADATA_SECTIONS.forEach(section => {
  section.fields.forEach(f => { ISBAR_FIELD_BY_ID[f.id] = f; });
});

function isbarOptionValues(field) {
  return (field.options || []).map(o => (typeof o === 'string' ? o : o.value));
}

function isbarOptionLabel(field, value) {
  if (field.optionLabels && field.optionLabels[value]) return field.optionLabels[value];
  const opt = (field.options || []).find(o => (typeof o === 'string' ? o : o.value) === value);
  if (!opt) return value;
  return typeof opt === 'string' ? opt : opt.label;
}

// Is `field` currently relevant given the rest of the form state? Drives
// both "show/hide this input" and "is this conditional field required now".
function isbarFieldVisible(field, state) {
  const cond = field.conditionalOn;
  if (!cond) return true;
  const triggerVal = state[cond.field];
  if (cond.equals !== undefined) return triggerVal === cond.equals;
  if (cond.includes !== undefined) {
    const tokens = triggerVal ? String(triggerVal).split(',').map(t => t.trim()) : [];
    return tokens.includes(cond.includes);
  }
  if (cond.notEmpty) return !!(triggerVal && String(triggerVal).trim());
  return true;
}
