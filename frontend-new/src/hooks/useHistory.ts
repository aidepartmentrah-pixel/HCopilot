import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { historyApi } from '@/api/history'

export const historyKeys = {
  list: ['history', 'list'] as const,
}

export function useHistory() {
  return useQuery({ queryKey: historyKeys.list, queryFn: historyApi.list })
}

export function useDeleteHistoryRecord() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (stayId: number) => historyApi.delete(stayId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: historyKeys.list }),
  })
}
