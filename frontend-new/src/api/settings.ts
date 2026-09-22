import { apiClient } from './client'
import type { Ward, WardCreateInput, WardListResponse } from '@/types/ward'
import type { Doctor, DoctorInput, Nurse, NurseInput } from '@/types/staff'

export const wardsApi = {
  list: () => apiClient.get<WardListResponse>('/api/data/wards/list'),
  create: (body: WardCreateInput) => apiClient.post<{ success: boolean; ward: Ward }>('/api/data/wards/add', body),
  modify: (wardId: number, body: WardCreateInput) =>
    apiClient.put<{ success: boolean; ward: Ward }>(`/api/data/wards/modify/${wardId}`, body),
  delete: (wardId: number) => apiClient.delete<{ success: boolean; message: string }>(`/api/data/wards/delete/${wardId}`),
}

// Real, audited shapes (backend/features/staff_management/{doctors,nurses}_manager.py's own _row()) — typed here in NF7, where Settings actually builds these admin screens.
export const staffApi = {
  doctors: {
    list: () => apiClient.get<{ doctors: Doctor[]; total: number }>('/api/staff/doctors/list'),
    create: (body: DoctorInput) => apiClient.post<{ success: boolean; message: string }>('/api/staff/doctors/add', body),
    modify: (id: number, body: DoctorInput) =>
      apiClient.put<{ success: boolean; message: string }>(`/api/staff/doctors/modify/${id}`, body),
    toggleAbsent: (id: number) => apiClient.put<{ success: boolean; message: string }>(`/api/staff/doctors/toggle-absent/${id}`),
    delete: (id: number) => apiClient.delete<{ success: boolean; message: string }>(`/api/staff/doctors/delete/${id}`),
  },
  nurses: {
    list: () => apiClient.get<{ nurses: Nurse[]; total: number }>('/api/staff/nurses/list'),
    create: (body: NurseInput) => apiClient.post<{ success: boolean; message: string }>('/api/staff/nurses/add', body),
    modify: (id: number, body: NurseInput) =>
      apiClient.put<{ success: boolean; message: string }>(`/api/staff/nurses/modify/${id}`, body),
    toggleAbsent: (id: number) => apiClient.put<{ success: boolean; message: string }>(`/api/staff/nurses/toggle-absent/${id}`),
    delete: (id: number) => apiClient.delete<{ success: boolean; message: string }>(`/api/staff/nurses/delete/${id}`),
  },
}

// Shifts/Groups/Users/Reset — real, confirmed endpoint paths, but not built
// into a Settings screen this phase (see NF7's own scope decision) —
// left loose rather than guessed, same discipline as the deeper
// /api/statistics/* endpoints in NF2/NF6.
export const authApi = {
  users: {
    list: () => apiClient.get<{ users: unknown[] }>('/api/auth/users'),
    create: (body: unknown) => apiClient.post('/api/auth/users', body),
    modify: (userId: number, body: unknown) => apiClient.put(`/api/auth/users/${userId}`, body),
    delete: (userId: number) => apiClient.delete(`/api/auth/users/${userId}`),
  },
}

export const resetApi = {
  // POST /api/reset/all — real, destructive, wipes all data
  // (backend/features/reset/api.py). Gated behind NF7.3's Danger Zone
  // strong-confirmation flow; never called automatically by tests
  // against the shared dev database (see NF7.3's own e2e note).
  all: () => apiClient.post<{ success: boolean; message: string }>('/api/reset/all'),
}
