import { apiClient } from './client'
import type { LogPatientListResponse } from '@/types/history'

// GET /api/data/log-patients/list takes no query parameters at all
// (log_patients_manager.get_all() is a plain unfiltered query) — every
// filter on the History page is client-side against this full list,
// confirmed by the ER UI Architecture Redesign's own NF5.1-equivalent
// audit (UI-C5). Don't add query params here without re-checking the
// backend first.
export const historyApi = {
  list: () => apiClient.get<LogPatientListResponse>('/api/data/log-patients/list'),
  delete: (stayId: number) => apiClient.delete<{ ok: boolean; message: string }>(`/api/data/log-patients/delete/${stayId}`),
}
