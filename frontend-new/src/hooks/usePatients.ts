import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { patientsApi } from '@/api/patients'
import type { PatientCreateInput, PatientModifyInput } from '@/types/patient'

export const patientsKeys = {
  list: ['patients', 'list'] as const,
  details: (stayId: number) => ['patients', 'details', stayId] as const,
  nextIds: ['patients', 'next-ids'] as const,
}

export function usePatients() {
  return useQuery({ queryKey: patientsKeys.list, queryFn: patientsApi.list })
}

export function usePatientDetails(stayId: number | null) {
  return useQuery({
    queryKey: patientsKeys.details(stayId ?? 0),
    queryFn: () => patientsApi.details(stayId!),
    enabled: stayId != null,
  })
}

export function useNextIds() {
  return useQuery({ queryKey: patientsKeys.nextIds, queryFn: patientsApi.nextIds, staleTime: 0 })
}

export function useCreatePatient() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: PatientCreateInput) => patientsApi.create(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: patientsKeys.list })
      queryClient.invalidateQueries({ queryKey: patientsKeys.nextIds })
    },
  })
}

export function useModifyPatient() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ stayId, body }: { stayId: number; body: PatientModifyInput }) => patientsApi.modify(stayId, body),
    onSuccess: (_data, { stayId }) => {
      queryClient.invalidateQueries({ queryKey: patientsKeys.list })
      queryClient.invalidateQueries({ queryKey: patientsKeys.details(stayId) })
    },
  })
}

export function useDeletePatient() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (stayId: number) => patientsApi.delete(stayId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: patientsKeys.list }),
  })
}
