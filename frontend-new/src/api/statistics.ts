import { apiClient } from './client'
import type {
  AcuityBreakdownStats,
  SafetyRiskSummary,
  StaffStats,
  StatisticsOverview,
  ThroughputStats,
  TopComplaintsStats,
  ValueCountsChart,
  VitalsSummaryStats,
  WaitingTimesStats,
} from '@/types/statistics'

export const statisticsApi = {
  overview: () => apiClient.get<StatisticsOverview>('/api/statistics/overview'),
  waitingTimes: () => apiClient.get<WaitingTimesStats>('/api/statistics/waiting-times'),
  acuityBreakdown: () => apiClient.get<AcuityBreakdownStats>('/api/statistics/acuity-breakdown'),
  throughput: () => apiClient.get<ThroughputStats>('/api/statistics/throughput'),
  topComplaints: () => apiClient.get<TopComplaintsStats>('/api/statistics/top-complaints'),
  vitalsSummary: () => apiClient.get<VitalsSummaryStats>('/api/statistics/vitals-summary'),
  staffStats: () => apiClient.get<StaffStats>('/api/statistics/staff-stats'),

  // ISBAR nursing-documentation aggregates — real, existing endpoints
  // (already used by the old frontend's own Statistics page). Presented
  // there as charts; a candidate for an "alerts" treatment in this rewrite
  // per the user's own steer, using this same real data, no new backend.
  clinicalStatus: () => apiClient.get<ValueCountsChart>('/api/statistics/clinical-status'),
  immediateConcerns: () => apiClient.get<ValueCountsChart>('/api/statistics/immediate-concerns'),
  safetyRisks: () => apiClient.get<SafetyRiskSummary>('/api/statistics/safety-risks'),
  o2Support: () => apiClient.get<ValueCountsChart>('/api/statistics/o2-support'),
  dischargeTransfer: () => apiClient.get<ValueCountsChart>('/api/statistics/discharge-transfer'),
}
