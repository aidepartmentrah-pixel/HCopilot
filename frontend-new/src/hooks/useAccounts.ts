import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { authApi } from '@/api/settings'
import type { UserAccountInput } from '@/types/settings'

export const accountsKeys = {
  users: ['accounts', 'users'] as const,
}

export function useAccounts() {
  return useQuery({ queryKey: accountsKeys.users, queryFn: authApi.users.list })
}

export function useCreateAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: UserAccountInput) => authApi.users.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: accountsKeys.users }),
  })
}

export function useModifyAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, body }: { userId: number; body: UserAccountInput }) => authApi.users.modify(userId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: accountsKeys.users }),
  })
}

export function useDeleteAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (userId: number) => authApi.users.delete(userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: accountsKeys.users }),
  })
}
