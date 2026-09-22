import { apiClient } from './client'
import type { NextIds, PatientCreateInput, PatientDetails, PatientListResponse, PatientModifyInput } from '@/types/patient'

export const patientsApi = {
  list: () => apiClient.get<PatientListResponse>('/api/patients/list'),
  nextIds: () => apiClient.get<NextIds>('/api/patients/next-ids'),
  details: (stayId: number) => apiClient.get<PatientDetails>(`/api/patients/${stayId}/details`),
  create: (body: PatientCreateInput) => apiClient.post<{ success: boolean; message: string }>('/api/patients/add', body),
  modify: (stayId: number, body: PatientModifyInput) =>
    apiClient.put<{ success: boolean; message: string }>(`/api/patients/modify/${stayId}`, body),
  delete: (stayId: number) => apiClient.delete<{ success: boolean; message: string }>(`/api/patients/delete/${stayId}`),
}
