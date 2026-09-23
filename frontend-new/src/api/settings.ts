import { apiClient } from './client'
import type { Ward, WardCreateInput, WardListResponse } from '@/types/ward'
import type { Doctor, DoctorInput, Nurse, NurseInput } from '@/types/staff'
import type {
  HospitalDirectoryConfig,
  HospitalDirectoryConfigInput,
  MiddleNameCandidatesResponse,
  ModelFile,
  TestConnectionResult,
  TrainingRun,
  TrainingStatus,
  UserAccount,
  UserAccountInput,
} from '@/types/settings'

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

// Real, confirmed endpoint paths and response shapes (backend/features/
// auth/api.py, users_manager.py) — built into the Accounts & Permissions
// screen in V2.6. `sections`/`settings_tabs`/`statistics_tabs` are shared
// with the old frontend's own permission enforcement (frontend/js/auth.js
// reads these same comma-separated key strings) — the new frontend's
// Accounts UI must write real, existing key vocabulary, never invented
// keys, or it would silently break old-frontend nav gating for shared
// accounts. See V2.6's log for the full key-compatibility audit.
export const authApi = {
  users: {
    list: () => apiClient.get<{ users: UserAccount[] }>('/api/auth/users'),
    create: (body: UserAccountInput) => apiClient.post<{ success: boolean; user_id: number }>('/api/auth/users', body),
    modify: (userId: number, body: UserAccountInput) =>
      apiClient.put<{ success: boolean }>(`/api/auth/users/${userId}`, body),
    delete: (userId: number) => apiClient.delete<{ success: boolean }>(`/api/auth/users/${userId}`),
  },
}

// Real, confirmed shapes (backend/features/hospital_directory/api.py) —
// ONE connection config powers both patient search (ISBAR's directory
// fallback) and the ER Current Visits poll-diff safety net (er_sync.py) —
// there is no separate "ER Current Visits" connection to configure (see
// V2.6's log for why a second integrations sub-page was deliberately not
// built).
export const hospitalDirectoryApi = {
  getConfig: () => apiClient.get<HospitalDirectoryConfig>('/api/hospital-directory/config'),
  saveConfig: (body: HospitalDirectoryConfigInput) =>
    apiClient.post<{ success: boolean; message: string }>('/api/hospital-directory/config/save', body),
  testConnection: () => apiClient.post<TestConnectionResult>('/api/hospital-directory/config/test-connection'),
  getMiddleNameCandidates: () =>
    apiClient.get<MiddleNameCandidatesResponse>('/api/hospital-directory/config/middle-name-candidates'),
  saveMiddleNameCandidates: (names: string[]) =>
    apiClient.post<{ success: boolean; names: string[] }>('/api/hospital-directory/config/middle-name-candidates', { names }),
}

// Real, confirmed shapes (backend/features/model_training/api.py) — the
// structured training/run-history backend Model Registry + Training are
// built from (distinct from the legacy raw-filesystem `modelFilesApi`
// below, which V2.6 demotes to Technical Details per §18–19).
export const modelTrainingApi = {
  train: (modelName?: string) =>
    apiClient.post<TrainingRun>(`/api/model-training/train${modelName ? `?model_name=${modelName}` : ''}`),
  status: () => apiClient.get<TrainingStatus>('/api/model-training/status'),
  listRuns: () => apiClient.get<{ runs: TrainingRun[]; count: number }>('/api/model-training/runs'),
  getLive: () => apiClient.get<TrainingRun>('/api/model-training/live'),
  promote: (runId: string) => apiClient.post<TrainingRun>(`/api/model-training/runs/${runId}/promote`),
  deleteRun: (runId: string) => apiClient.delete<{ deleted: string }>(`/api/model-training/runs/${runId}`),
  /** Not an apiClient call — GET /export returns a raw file download, so this is a plain URL for an <a> tag rather than a JSON fetch. */
  exportUrl: (runId: string) => `/api/model-training/runs/${runId}/export`,
}

// GET /api/models/list — backend/features/model_files/api.py, the legacy
// raw-filesystem view (§18–19).
export const modelFilesApi = {
  list: () => apiClient.get<{ models: ModelFile[]; count: number; timestamp: string }>('/api/models/list'),
}
