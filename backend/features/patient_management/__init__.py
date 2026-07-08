# Package marker — exposes this directory as a Python module.
# patient_management: extends data_management with patient-centric logic —
# auto-generating next patient/stay IDs and enforcing one-active-stay-per-patient.
# PatientManager subclasses DailyPatientsManager and renames subject_id → patient_id
# in outgoing responses to match the frontend's naming convention.
