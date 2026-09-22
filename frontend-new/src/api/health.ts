import { apiClient } from './client'
import type { HealthResponse } from '@/types/health'

export const healthApi = {
  check: () => apiClient.get<HealthResponse>('/health'),
}
