# Package marker — exposes this directory as a Python module.
# scheduling: creates and manages patient assignments — one patient linked to
# one bed plus an optional doctor and up to two nurses.
# All links are stored in the shared relation CSV tables (patient_bed,
# patient_doctor, patient_nurse) via RelationsManager; there is no separate
# scheduling-specific table.
