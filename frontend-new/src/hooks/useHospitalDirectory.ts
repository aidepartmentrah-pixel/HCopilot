import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { hospitalDirectoryApi } from '@/api/settings'
import type { HospitalDirectoryConfigInput } from '@/types/settings'

export const hospitalDirectoryKeys = {
  config: ['hospital-directory', 'config'] as const,
  middleNameCandidates: ['hospital-directory', 'middle-name-candidates'] as const,
}

export function useHospitalDirectoryConfig() {
  return useQuery({ queryKey: hospitalDirectoryKeys.config, queryFn: hospitalDirectoryApi.getConfig })
}

export function useSaveHospitalDirectoryConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: HospitalDirectoryConfigInput) => hospitalDirectoryApi.saveConfig(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: hospitalDirectoryKeys.config }),
  })
}

/** Tests the currently SAVED config, not unsaved form state (the backend's own save-then-test contract) — always refetches `config` after, since a test also persists `last_test_status`/`last_test_at`. */
export function useTestHospitalDirectoryConnection() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => hospitalDirectoryApi.testConnection(),
    onSuccess: () => qc.invalidateQueries({ queryKey: hospitalDirectoryKeys.config }),
  })
}

export function useMiddleNameCandidates() {
  return useQuery({ queryKey: hospitalDirectoryKeys.middleNameCandidates, queryFn: hospitalDirectoryApi.getMiddleNameCandidates })
}

export function useSaveMiddleNameCandidates() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (names: string[]) => hospitalDirectoryApi.saveMiddleNameCandidates(names),
    onSuccess: () => qc.invalidateQueries({ queryKey: hospitalDirectoryKeys.middleNameCandidates }),
  })
}
