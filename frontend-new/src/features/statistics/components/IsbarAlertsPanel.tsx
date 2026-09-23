import { AlertTriangle, Wind } from 'lucide-react'
import type { ValueCountsChart } from '@/types/statistics'
import styles from './IsbarAlertsPanel.module.css'

const ADVANCED_O2_SUPPORT = new Set(['high_flow_nc', 'cpap_bipap', 'mechanical_vent'])

function countFor(chart: ValueCountsChart, label: string): number {
  const idx = chart.labels.indexOf(label)
  return idx === -1 ? 0 : chart.counts[idx]
}

interface IsbarAlertsPanelProps {
  clinicalStatus: ValueCountsChart
  o2Support: ValueCountsChart
}

/**
 * Real-time clinical banners only (critical/deteriorating count, advanced
 * respiratory support count) — the same real ISBAR-aggregate endpoints the
 * old frontend charts. "Most Reported Concerns" and "Safety Risks
 * Documented" used to live here as text lists per an earlier NF6 steer,
 * but the V2 Statistics spec (§20/§21) explicitly supersedes that and
 * promotes them to their own AnalyticsCard visualizations — see
 * StatisticsPage. Nothing here is invented; every count traces to a real
 * endpoint.
 */
export function IsbarAlertsPanel({ clinicalStatus, o2Support }: IsbarAlertsPanelProps) {
  const criticalCount = countFor(clinicalStatus, 'Critical') + countFor(clinicalStatus, 'Deteriorating')
  const advancedO2Count = o2Support.labels
    .filter((l) => ADVANCED_O2_SUPPORT.has(l))
    .reduce((sum, l) => sum + countFor(o2Support, l), 0)

  if (criticalCount === 0 && advancedO2Count === 0) return null

  return (
    <div className={styles.panel}>
      {criticalCount > 0 && (
        <div className={[styles.banner, styles.danger].join(' ')} role="alert">
          <AlertTriangle size={18} aria-hidden="true" />
          {criticalCount} patient{criticalCount === 1 ? '' : 's'} currently documented as Critical or Deteriorating
        </div>
      )}
      {advancedO2Count > 0 && (
        <div className={[styles.banner, styles.warning].join(' ')} role="status">
          <Wind size={18} aria-hidden="true" />
          {advancedO2Count} patient{advancedO2Count === 1 ? '' : 's'} on advanced respiratory support (high-flow NC / CPAP-BiPAP /
          mechanical vent)
        </div>
      )}
    </div>
  )
}
