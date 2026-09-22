import { useQuery } from '@tanstack/react-query'
import { healthApi } from '@/api/health'

export function useHealth() {
  return useQuery({
    queryKey: ['health'] as const,
    queryFn: healthApi.check,
    staleTime: 30_000,
    retry: 1,
  })
}
