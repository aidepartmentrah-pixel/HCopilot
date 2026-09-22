import { useQuery } from '@tanstack/react-query'
import { erApi } from '@/api/er'

export const erRosterKeys = {
  current: ['er', 'roster'] as const,
}

/**
 * The roster tolerates the external directory being down (§27) — a
 * non-"ok" `status` in the response is a normal, renderable state, not a
 * thrown error; only a real network/HTTP failure rejects this query.
 */
export function useErRoster() {
  return useQuery({ queryKey: erRosterKeys.current, queryFn: erApi.currentVisits })
}
