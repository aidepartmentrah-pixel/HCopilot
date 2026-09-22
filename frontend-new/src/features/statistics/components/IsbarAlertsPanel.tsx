import { AlertTriangle, ShieldAlert, Stethoscope, Wind } from 'lucide-react'
import { EmptyState } from '@/components/feedback/EmptyState'
import type { SafetyRiskSummary, ValueCountsChart } from '@/types/statistics'
import { humanize } from '@/utils/humanize'
import styles from './IsbarAlertsPanel.module.css'

const HIGH_SEVERITY_CONCERNS = new Set([
  'respiratory_distress',
  'chest_pain',
  'sepsis',
  'altered_loc',
  'active_bleeding',
  'hypo_hyperglycemia',
])
const ADVANCED_O2_SUPPORT = new Set(['high_flow_nc', 'cpap_bipap', 'mechanical_vent'])

function countFor(chart: ValueCountsChart, label: string): number {
  const idx = chart.labels.indexOf(label)
  return idx === -1 ? 0 : chart.counts[idx]
}

interface IsbarAlertsPanelProps {
  clinicalStatus: ValueCountsChart
  immediateConcerns: ValueCountsChart
  safetyRisks: SafetyRiskSummary
  o2Support: ValueCountsChart
}

/**
 * The same real ISBAR-aggregate endpoints the old frontend already charts
 * (clinical-status, immediate-concerns, safety-risks, o2-support) —
 * presented as scannable alerts instead of donut/bar charts, per the
 * user's own steer: this is a genuinely smarter use of data that already
 * exists, not a new backend capability. Every number here traces to a
 * real endpoint; nothing here is invented or estimated.
 */
export function IsbarAlertsPanel({ clinicalStatus, immediateConcerns, safetyRisks, o2Support }: IsbarAlertsPanelProps) {
  const criticalCount = countFor(clinicalStatus, 'Critical') + countFor(clinicalStatus, 'Deteriorating')
  const advancedO2Count = o2Support.labels
    .filter((l) => ADVANCED_O2_SUPPORT.has(l))
    .reduce((sum, l) => sum + countFor(o2Support, l), 0)
  const topConcerns = immediateConcerns.labels.slice(0, 3).map((label, i) => ({
    label,
    count: immediateConcerns.counts[i],
    severe: HIGH_SEVERITY_CONCERNS.has(label),
  }))

  const documented =
    clinicalStatus.total > 0 || immediateConcerns.total > 0 || safetyRisks.documented_total > 0 || o2Support.total > 0

  if (!documented) {
    return (
      <EmptyState
        title="No ISBAR nursing documentation yet"
        description="Alerts populate once handovers record clinical status, concerns, and safety risks."
      />
    )
  }

  return (
    <div className={styles.panel}>
      <p className={styles.disclosure}>
        Aggregates from ISBAR nursing documentation. Counts reflect only stays where the relevant field has actually been
        recorded — undocumented fields are excluded, not counted as negative.
      </p>

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

      <div className={styles.grid}>
        <div className={styles.section}>
          <h4 className={styles.sectionTitle}>
            <Stethoscope size={16} aria-hidden="true" /> Most Reported Concerns
          </h4>
          {topConcerns.length === 0 ? (
            <p className={styles.empty}>None documented yet.</p>
          ) : (
            <ul className={styles.list}>
              {topConcerns.map((c) => (
                <li key={c.label} className={styles.listItem}>
                  <span className={c.severe ? styles.severeLabel : styles.label}>{humanize(c.label)}</span>
                  <span className={styles.count}>{c.count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={styles.section}>
          <h4 className={styles.sectionTitle}>
            <ShieldAlert size={16} aria-hidden="true" /> Safety Risks Documented
          </h4>
          <ul className={styles.list}>
            {(
              [
                ['Fall Risk', safetyRisks.risks.fall_risk],
                ['Pressure Injury Risk', safetyRisks.risks.pressure_injury_risk],
                ['Allergies', safetyRisks.risks.allergies],
                ['Isolation Precautions', safetyRisks.risks.isolation_precautions],
              ] as const
            ).map(([label, r]) => (
              <li key={label} className={styles.listItem}>
                <span className={styles.label}>{label}</span>
                <span className={styles.count}>
                  {r.count} <span className={styles.pct}>({r.pct}%)</span>
                </span>
              </li>
            ))}
          </ul>
          <p className={styles.footnote}>of {safetyRisks.documented_total} documented stays</p>
        </div>
      </div>
    </div>
  )
}
