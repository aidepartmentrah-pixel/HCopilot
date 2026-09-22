import { apiClient } from './client'
import type { BedCreateInput, BedDischargeInput, BedlessResponse, BedListResponse, BedStats } from '@/types/bed'

export const bedsApi = {
  list: () => apiClient.get<BedListResponse>('/api/beds/list'),
  bedless: () => apiClient.get<BedlessResponse>('/api/beds/bedless'),
  stats: () => apiClient.get<BedStats>('/api/beds/stats'),
  assign: (bedId: number, patientId: number, bedOccupationTime?: string) =>
    apiClient.post(`/api/beds/assign/${bedId}`, { patient_id: patientId, bed_occupation_time: bedOccupationTime }),
  move: (patientId: number, newBedId: number) => apiClient.post(`/api/beds/move/${patientId}`, { new_bed_id: newBedId }),
  release: (bedId: number) => apiClient.post(`/api/beds/release/${bedId}`),
  dischargeFromBed: (bedId: number, body: BedDischargeInput) =>
    apiClient.post<{ ok: boolean; message: string; stay_id: number }>(`/api/beds/discharge/${bedId}`, body),
  // Bedless patients have no bed_id to discharge "from" — unurgent/api.py's
  // discharge endpoint (keyed on patient_id) is the one that already covers
  // this, reused rather than duplicated (see beds_display's own discharge
  // route, which requires an existing PatientBed link).
  dischargeBedless: (patientId: number, body: BedDischargeInput) =>
    apiClient.post<{ ok: boolean; message: string; stay_id: number }>(`/api/unurgent/discharge/${patientId}`, body),
  create: (body: BedCreateInput) => apiClient.post('/api/beds/add', body),
  modify: (bedId: number, body: BedCreateInput) => apiClient.put(`/api/beds/modify/${bedId}`, body),
  delete: (bedId: number) => apiClient.delete(`/api/beds/delete/${bedId}`),
}
