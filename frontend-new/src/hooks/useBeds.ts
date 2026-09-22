import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { bedsApi } from '@/api/beds'
import type { BedCreateInput, BedDischargeInput } from '@/types/bed'

export const bedsKeys = {
  list: ['beds', 'list'] as const,
  bedless: ['beds', 'bedless'] as const,
  stats: ['beds', 'stats'] as const,
}

function invalidateBoard(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: bedsKeys.list })
  queryClient.invalidateQueries({ queryKey: bedsKeys.bedless })
  queryClient.invalidateQueries({ queryKey: bedsKeys.stats })
}

export function useBeds() {
  return useQuery({ queryKey: bedsKeys.list, queryFn: bedsApi.list })
}

export function useBedlessPatients() {
  return useQuery({ queryKey: bedsKeys.bedless, queryFn: bedsApi.bedless })
}

export function useBedStats() {
  return useQuery({ queryKey: bedsKeys.stats, queryFn: bedsApi.stats })
}

export function useAssignBed() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ bedId, patientId, bedOccupationTime }: { bedId: number; patientId: number; bedOccupationTime?: string }) =>
      bedsApi.assign(bedId, patientId, bedOccupationTime),
    onSuccess: () => invalidateBoard(queryClient),
  })
}

export function useDischargeFromBed() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ bedId, body }: { bedId: number; body: BedDischargeInput }) => bedsApi.dischargeFromBed(bedId, body),
    onSuccess: () => invalidateBoard(queryClient),
  })
}

export function useDischargeBedless() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ patientId, body }: { patientId: number; body: BedDischargeInput }) => bedsApi.dischargeBedless(patientId, body),
    onSuccess: () => invalidateBoard(queryClient),
  })
}

export function useCreateBed() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: BedCreateInput) => bedsApi.create(body),
    onSuccess: () => invalidateBoard(queryClient),
  })
}

export function useModifyBed() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ bedId, body }: { bedId: number; body: BedCreateInput }) => bedsApi.modify(bedId, body),
    onSuccess: () => invalidateBoard(queryClient),
  })
}

export function useDeleteBed() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (bedId: number) => bedsApi.delete(bedId),
    onSuccess: () => invalidateBoard(queryClient),
  })
}
