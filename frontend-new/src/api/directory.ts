import { apiClient } from './client'
import type { DirectorySearchResponse } from '@/types/directory'

export const directoryApi = {
  // Exactly one search mode per call: patientId alone, or all three names
  // together — no free-text search (see hospital_directory/client.py's own
  // docstring, confirmed against the vendor's live mock, not assumed).
  search: (params: { patientId?: string; firstName?: string; fatherName?: string; lastName?: string }) => {
    const query = new URLSearchParams()
    if (params.patientId) query.set('patient_id', params.patientId)
    if (params.firstName) query.set('first_name', params.firstName)
    if (params.fatherName) query.set('father_name', params.fatherName)
    if (params.lastName) query.set('last_name', params.lastName)
    return apiClient.get<DirectorySearchResponse>(`/api/hospital-directory/patients/search?${query.toString()}`)
  },
}
