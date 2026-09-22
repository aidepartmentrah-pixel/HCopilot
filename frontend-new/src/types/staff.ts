export const DOCTOR_TYPES = ['doctor', 'intern'] as const
export const NURSE_ROLES = ['PN', 'RN', 'Bed_Admission'] as const

export interface Doctor {
  id: number
  name: string | null
  intern_or_not: (typeof DOCTOR_TYPES)[number]
  shift: string
  work_days: string | null
  absent: boolean
  patientNb: string | null
  availabilityTimeStart: string | null
}

export interface Nurse {
  id: number
  name: string | null
  role: (typeof NURSE_ROLES)[number]
  shift: string
  group: string | null
  absent: boolean
  patientNB: string | null
  availabilityTimeStart: string | null
}

export interface DoctorInput {
  intern_or_not: string
  shift: string
  work_days: string
  name?: string
}

export interface NurseInput {
  role: string
  shift: string
  group: string
  name?: string
}
