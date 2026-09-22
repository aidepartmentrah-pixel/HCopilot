import { apiClient } from './client'
import type { ErRosterResponse } from '@/types/er'

export const erApi = {
  // Always 200 with a status/message even when the external directory is
  // down — never throws for that case (see hospital_directory's own
  // "never break the caller" contract). Callers should check `.status`.
  currentVisits: () => apiClient.get<ErRosterResponse>('/api/hospital-directory/er/current-visits'),
}
