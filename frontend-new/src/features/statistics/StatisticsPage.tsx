import { PageHeader } from '@/components/layout/PageHeader'
import { ErrorState } from '@/components/feedback/ErrorState'
import { LoadingState } from '@/components/feedback/LoadingState'
import {
  useAcuityBreakdown,
  useClinicalStatusDistribution,
  useDischargeTransferDistribution,
  useImmediateConcerns,
  useO2SupportDistribution,
  useSafetyRisks,
  useStatisticsOverview,
  useThroughput,
  useTopComplaints,
  useWaitingTimes,
} from '@/hooks/useStatistics'
import { humanize } from '@/utils/humanize'
import { acuityBarColor } from './acuityColor'
import { BarList } from './components/BarList'
import { ChartCard } from './components/ChartCard'
import { IsbarAlertsPanel } from './components/IsbarAlertsPanel'
import { KpiRow } from './components/KpiRow'
import styles from './StatisticsPage.module.css'

const DAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function StatisticsPage() {
  const overview = useStatisticsOverview()
  const waitingTimes = useWaitingTimes()
  const acuityBreakdown = useAcuityBreakdown()
  const throughput = useThroughput()
  const topComplaints = useTopComplaints()
  const clinicalStatus = useClinicalStatusDistribution()
  const immediateConcerns = useImmediateConcerns()
  const safetyRisks = useSafetyRisks()
  const o2Support = useO2SupportDistribution()
  const dischargeTransfer = useDischargeTransferDistribution()

  const queries = [overview, waitingTimes, acuityBreakdown, throughput, topComplaints, clinicalStatus, immediateConcerns, safetyRisks, o2Support, dischargeTransfer]
  const isLoading = queries.some((q) => q.isLoading)
  const hasError = queries.some((q) => q.isError)

  return (
    <>
      <PageHeader title="Statistics" subtitle="ER performance and patient-flow analytics" />

      {isLoading && <LoadingState label="Loading statistics…" />}
      {!isLoading && hasError && (
        <ErrorState description="Some statistics couldn't be loaded." onRetry={() => queries.forEach((q) => q.refetch())} />
      )}

      {!isLoading && !hasError && overview.data && (
        <>
          <KpiRow overview={overview.data} />

          <div className={styles.alertsCard}>
            {clinicalStatus.data && immediateConcerns.data && safetyRisks.data && o2Support.data && (
              <IsbarAlertsPanel
                clinicalStatus={clinicalStatus.data}
                immediateConcerns={immediateConcerns.data}
                safetyRisks={safetyRisks.data}
                o2Support={o2Support.data}
              />
            )}
          </div>

          <div className={styles.chartGrid}>
            <ChartCard title="Wait Time Distribution" isEmpty={!waitingTimes.data?.wait_to_bed.sample_count}>
              {waitingTimes.data && (
                <BarList items={Object.entries(waitingTimes.data.wait_to_bed.distribution).map(([label, value]) => ({ label, value }))} />
              )}
            </ChartCard>

            <ChartCard title="Length of Stay" isEmpty={!waitingTimes.data?.length_of_stay.sample_count}>
              {waitingTimes.data && (
                <BarList items={Object.entries(waitingTimes.data.length_of_stay.distribution).map(([label, value]) => ({ label, value }))} />
              )}
            </ChartCard>

            <ChartCard title="Acuity Breakdown" isEmpty={!acuityBreakdown.data?.acuity_breakdown.some((a) => a.count > 0)}>
              {acuityBreakdown.data && (
                <BarList
                  items={acuityBreakdown.data.acuity_breakdown.map((a) => ({
                    label: `ESI ${a.level}`,
                    value: a.count,
                    color: acuityBarColor(a.level),
                  }))}
                />
              )}
            </ChartCard>

            <ChartCard title="Arrivals by Day of Week" isEmpty={!throughput.data?.total_arrivals}>
              {throughput.data && (
                <BarList items={DAY_ORDER.map((day) => ({ label: day, value: throughput.data.by_day_of_week[day] ?? 0 }))} />
              )}
            </ChartCard>

            <ChartCard title="Top Complaints" isEmpty={!topComplaints.data?.complaints.length}>
              {topComplaints.data && (
                <BarList items={topComplaints.data.complaints.slice(0, 8).map((c) => ({ label: c.complaint, value: c.count }))} />
              )}
            </ChartCard>

            <ChartCard title="Discharge / Transfer Plan" subtitle="From ISBAR handover documentation" isEmpty={!dischargeTransfer.data?.total}>
              {dischargeTransfer.data && (
                <BarList
                  items={dischargeTransfer.data.labels.map((label, i) => ({
                    label: humanize(label),
                    value: dischargeTransfer.data.counts[i],
                  }))}
                />
              )}
            </ChartCard>
          </div>
        </>
      )}
    </>
  )
}
