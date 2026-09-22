/** One row from GET /api/hospital-directory/patients/search — the external Hospital Directory. */
export interface DirectoryPatient {
  patient_id: string
  full_name?: string | null
  first_name?: string | null
  last_name?: string | null
  birth_date?: string | null
  age?: number | null
  sex?: string | null
}

export interface DirectorySearchResponse {
  success: boolean
  status: 'ok' | string
  message?: string
  items: DirectoryPatient[]
  total?: number
}
