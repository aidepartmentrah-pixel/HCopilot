import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { staffApi, wardsApi } from '@/api/settings'
import type { DoctorInput, NurseInput } from '@/types/staff'
import type { WardCreateInput } from '@/types/ward'

export const settingsKeys = {
  wards: ['settings', 'wards'] as const,
  doctors: ['settings', 'doctors'] as const,
  nurses: ['settings', 'nurses'] as const,
}

export function useWards() {
  return useQuery({ queryKey: settingsKeys.wards, queryFn: wardsApi.list })
}

export function useCreateWard() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: WardCreateInput) => wardsApi.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKeys.wards }),
  })
}

export function useModifyWard() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: WardCreateInput }) => wardsApi.modify(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKeys.wards }),
  })
}

export function useDeleteWard() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => wardsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKeys.wards }),
  })
}

export function useDoctors() {
  return useQuery({ queryKey: settingsKeys.doctors, queryFn: staffApi.doctors.list })
}

export function useCreateDoctor() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: DoctorInput) => staffApi.doctors.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKeys.doctors }),
  })
}

export function useModifyDoctor() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: DoctorInput }) => staffApi.doctors.modify(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKeys.doctors }),
  })
}

export function useDeleteDoctor() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => staffApi.doctors.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKeys.doctors }),
  })
}

export function useNurses() {
  return useQuery({ queryKey: settingsKeys.nurses, queryFn: staffApi.nurses.list })
}

export function useCreateNurse() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: NurseInput) => staffApi.nurses.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKeys.nurses }),
  })
}

export function useModifyNurse() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: NurseInput }) => staffApi.nurses.modify(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKeys.nurses }),
  })
}

export function useDeleteNurse() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => staffApi.nurses.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKeys.nurses }),
  })
}
