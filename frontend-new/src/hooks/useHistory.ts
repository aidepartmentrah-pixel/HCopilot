import { useQuery } from '@tanstack/react-query'
import { historyApi } from '@/api/history'

export const historyKeys = {
  list: ['history', 'list'] as const,
}

export function useHistory() {
  return useQuery({ queryKey: historyKeys.list, queryFn: historyApi.list })
}
