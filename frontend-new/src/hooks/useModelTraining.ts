import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '@/api/client'
import { modelFilesApi, modelTrainingApi } from '@/api/settings'

export const modelTrainingKeys = {
  status: ['model-training', 'status'] as const,
  runs: ['model-training', 'runs'] as const,
  live: ['model-training', 'live'] as const,
  files: ['model-training', 'files'] as const,
}

/** Polls while a run is in progress (Train Now's "show running state" requirement, §28) — otherwise a single fetch, no wasted background traffic. */
export function useTrainingStatus() {
  return useQuery({
    queryKey: modelTrainingKeys.status,
    queryFn: modelTrainingApi.status,
    refetchInterval: (query) => (query.state.data?.training_in_progress ? 3000 : false),
  })
}

export function useTrainingRuns() {
  return useQuery({ queryKey: modelTrainingKeys.runs, queryFn: modelTrainingApi.listRuns })
}

/** 404 is a real, expected state here (no run recorded live yet, §29's no-production-model case) — the query resolves to `null` instead of surfacing an error card. */
export function useLiveModel() {
  return useQuery({
    queryKey: modelTrainingKeys.live,
    queryFn: async () => {
      try {
        return await modelTrainingApi.getLive()
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null
        throw err
      }
    },
  })
}

export function useModelFiles() {
  return useQuery({ queryKey: modelTrainingKeys.files, queryFn: modelFilesApi.list })
}

function invalidateAllTrainingQueries(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: modelTrainingKeys.status })
  qc.invalidateQueries({ queryKey: modelTrainingKeys.runs })
  qc.invalidateQueries({ queryKey: modelTrainingKeys.live })
}

export function useTrainModel() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => modelTrainingApi.train(),
    onSuccess: () => invalidateAllTrainingQueries(qc),
  })
}

export function usePromoteRun() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (runId: string) => modelTrainingApi.promote(runId),
    onSuccess: () => invalidateAllTrainingQueries(qc),
  })
}

export function useDeleteRun() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (runId: string) => modelTrainingApi.deleteRun(runId),
    onSuccess: () => qc.invalidateQueries({ queryKey: modelTrainingKeys.runs }),
  })
}
