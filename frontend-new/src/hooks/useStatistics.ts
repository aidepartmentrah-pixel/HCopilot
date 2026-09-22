import { useQuery } from '@tanstack/react-query'
import { statisticsApi } from '@/api/statistics'

export const statisticsKeys = {
  overview: ['statistics', 'overview'] as const,
  waitingTimes: ['statistics', 'waiting-times'] as const,
  acuityBreakdown: ['statistics', 'acuity-breakdown'] as const,
  throughput: ['statistics', 'throughput'] as const,
  topComplaints: ['statistics', 'top-complaints'] as const,
  clinicalStatus: ['statistics', 'clinical-status'] as const,
  immediateConcerns: ['statistics', 'immediate-concerns'] as const,
  safetyRisks: ['statistics', 'safety-risks'] as const,
  o2Support: ['statistics', 'o2-support'] as const,
  dischargeTransfer: ['statistics', 'discharge-transfer'] as const,
}

export function useStatisticsOverview() {
  return useQuery({ queryKey: statisticsKeys.overview, queryFn: statisticsApi.overview })
}

export function useWaitingTimes() {
  return useQuery({ queryKey: statisticsKeys.waitingTimes, queryFn: statisticsApi.waitingTimes })
}

export function useAcuityBreakdown() {
  return useQuery({ queryKey: statisticsKeys.acuityBreakdown, queryFn: statisticsApi.acuityBreakdown })
}

export function useThroughput() {
  return useQuery({ queryKey: statisticsKeys.throughput, queryFn: statisticsApi.throughput })
}

export function useTopComplaints() {
  return useQuery({ queryKey: statisticsKeys.topComplaints, queryFn: statisticsApi.topComplaints })
}

export function useClinicalStatusDistribution() {
  return useQuery({ queryKey: statisticsKeys.clinicalStatus, queryFn: statisticsApi.clinicalStatus })
}

export function useImmediateConcerns() {
  return useQuery({ queryKey: statisticsKeys.immediateConcerns, queryFn: statisticsApi.immediateConcerns })
}

export function useSafetyRisks() {
  return useQuery({ queryKey: statisticsKeys.safetyRisks, queryFn: statisticsApi.safetyRisks })
}

export function useO2SupportDistribution() {
  return useQuery({ queryKey: statisticsKeys.o2Support, queryFn: statisticsApi.o2Support })
}

export function useDischargeTransferDistribution() {
  return useQuery({ queryKey: statisticsKeys.dischargeTransfer, queryFn: statisticsApi.dischargeTransfer })
}
