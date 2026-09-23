import { useState } from 'react'
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
import {
  acuityChartData,
  arrivalsByDayChartData,
  arrivalsByHourChartData,
  lengthOfStayChartData,
  losSummary,
  safetyRisksChartData,
  topComplaintsChartData,
  valueCountsChartData,
  waitTimeChartData,
  waitTimeSummary,
} from './chartData'
import { AcuityBreakdownTable } from './components/AcuityBreakdownTable'
import { AnalyticsCard } from './components/AnalyticsCard'
import type { ArrivalDimension } from './components/ArrivalDimensionToggle'
import { ArrivalDimensionToggle } from './components/ArrivalDimensionToggle'
import { DocumentationCoverageBanner } from './components/DocumentationCoverageBanner'
import { IsbarAlertsPanel } from './components/IsbarAlertsPanel'
import { KpiRow } from './components/KpiRow'
import styles from './StatisticsPage.module.css'

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
  const [arrivalDimension, setArrivalDimension] = useState<ArrivalDimension>('hour')

  return (
    <>
      <PageHeader
        title="Statistics"
        subtitle="ER performance and patient-flow analytics"
        actions={<span className={styles.dateContext}>Showing: All-time data</span>}
      />

      {overview.isLoading && <LoadingState label="Loading statistics…" />}
      {/* Only the KPI-row query gates the whole page (§31): every chart below manages its own loading/error state via AnalyticsCard so one failing endpoint never blanks the others. */}
      {!overview.isLoading && overview.isError && <ErrorState description="Statistics overview unavailable." onRetry={() => overview.refetch()} />}

      {!overview.isLoading && !overview.isError && overview.data && (
        <>
          <KpiRow overview={overview.data} />

          <DocumentationCoverageBanner />

          {clinicalStatus.data && o2Support.data && (
            <div className={styles.alertsCard}>
              <IsbarAlertsPanel clinicalStatus={clinicalStatus.data} o2Support={o2Support.data} />
            </div>
          )}

          <div className={styles.chartGrid}>
            <AnalyticsCard
              title="Most Reported Concerns"
              summary={immediateConcerns.data ? `n=${immediateConcerns.data.total} documented` : undefined}
              data={immediateConcerns.data ? valueCountsChartData(immediateConcerns.data) : []}
              allowedViews={['bar', 'donut', 'table']}
              defaultView="bar"
              barOrientation="horizontal"
              categorical
              total={immediateConcerns.data?.total}
              storageKey="statistics-concerns-view"
              isLoading={immediateConcerns.isLoading}
              isError={immediateConcerns.isError}
              onRetry={() => immediateConcerns.refetch()}
              emptyMessage="No documented values for this metric in the selected period."
            />

            <AnalyticsCard
              title="Safety Risks Documented"
              summary={safetyRisks.data ? `${safetyRisks.data.documented_total} documented stays` : undefined}
              data={safetyRisks.data ? safetyRisksChartData(safetyRisks.data) : []}
              allowedViews={['bar', 'donut', 'table']}
              defaultView="bar"
              barOrientation="horizontal"
              categorical
              storageKey="statistics-safety-risks-view"
              isLoading={safetyRisks.isLoading}
              isError={safetyRisks.isError}
              onRetry={() => safetyRisks.refetch()}
              emptyMessage="No documented values for this metric in the selected period."
            />

            <AnalyticsCard
              title="Wait Time Distribution"
              summary={waitingTimes.data ? waitTimeSummary(waitingTimes.data.wait_to_bed) : undefined}
              data={waitingTimes.data ? waitTimeChartData(waitingTimes.data.wait_to_bed.distribution) : []}
              allowedViews={['bar', 'line', 'table']}
              defaultView="bar"
              total={waitingTimes.data?.wait_to_bed.sample_count}
              valueLabel="Patients"
              storageKey="statistics-wait-time-view"
              isLoading={waitingTimes.isLoading}
              isError={waitingTimes.isError}
              onRetry={() => waitingTimes.refetch()}
            />

            <AnalyticsCard
              title="Length of Stay Distribution"
              summary={waitingTimes.data ? losSummary(waitingTimes.data.length_of_stay) : undefined}
              data={waitingTimes.data ? lengthOfStayChartData(waitingTimes.data.length_of_stay.distribution) : []}
              allowedViews={['bar', 'line', 'table']}
              defaultView="bar"
              total={waitingTimes.data?.length_of_stay.sample_count}
              valueLabel="Patients"
              storageKey="statistics-los-view"
              isLoading={waitingTimes.isLoading}
              isError={waitingTimes.isError}
              onRetry={() => waitingTimes.refetch()}
            />

            <AnalyticsCard
              title="Acuity Breakdown"
              summary={acuityBreakdown.data ? `n=${acuityBreakdown.data.acuity_breakdown.reduce((s, a) => s + a.count, 0)}` : undefined}
              data={acuityBreakdown.data ? acuityChartData(acuityBreakdown.data.acuity_breakdown) : []}
              allowedViews={['donut', 'bar', 'table']}
              defaultView="donut"
              valueLabel="Patients"
              storageKey="statistics-acuity-view"
              isLoading={acuityBreakdown.isLoading}
              isError={acuityBreakdown.isError}
              onRetry={() => acuityBreakdown.refetch()}
              footer={acuityBreakdown.data && <AcuityBreakdownTable breakdown={acuityBreakdown.data.acuity_breakdown} />}
            />

            <AnalyticsCard
              title="Patient Arrivals"
              summary={throughput.data ? `Total arrivals tracked: ${throughput.data.total_arrivals}` : undefined}
              data={
                throughput.data
                  ? arrivalDimension === 'hour'
                    ? arrivalsByHourChartData(throughput.data.by_hour)
                    : arrivalsByDayChartData(throughput.data.by_day_of_week)
                  : []
              }
              allowedViews={['bar', 'line', 'table']}
              defaultView="bar"
              valueLabel="Arrivals"
              storageKey="statistics-arrivals-view"
              isLoading={throughput.isLoading}
              isError={throughput.isError}
              onRetry={() => throughput.refetch()}
              headerExtra={<ArrivalDimensionToggle value={arrivalDimension} onChange={setArrivalDimension} />}
            />
          </div>

          <h2 className={styles.sectionTitle}>Additional Analyses</h2>
          <div className={styles.chartGrid}>
            <AnalyticsCard
              title="Top Complaints"
              data={topComplaints.data ? topComplaintsChartData(topComplaints.data.complaints) : []}
              allowedViews={['bar', 'table']}
              defaultView="bar"
              barOrientation="horizontal"
              valueLabel="Patients"
              storageKey="statistics-complaints-view"
              isLoading={topComplaints.isLoading}
              isError={topComplaints.isError}
              onRetry={() => topComplaints.refetch()}
            />

            <AnalyticsCard
              title="Discharge / Transfer Plan"
              summary={dischargeTransfer.data ? `n=${dischargeTransfer.data.total} documented` : undefined}
              data={dischargeTransfer.data ? valueCountsChartData(dischargeTransfer.data) : []}
              allowedViews={['bar', 'donut', 'table']}
              defaultView="bar"
              categorical
              total={dischargeTransfer.data?.total}
              storageKey="statistics-discharge-view"
              isLoading={dischargeTransfer.isLoading}
              isError={dischargeTransfer.isError}
              onRetry={() => dischargeTransfer.refetch()}
              emptyMessage="No documented values for this metric in the selected period."
            />

            <AnalyticsCard
              title="Clinical Status"
              summary={clinicalStatus.data ? `n=${clinicalStatus.data.total} documented` : undefined}
              data={clinicalStatus.data ? valueCountsChartData(clinicalStatus.data) : []}
              allowedViews={['bar', 'donut', 'table']}
              defaultView="donut"
              categorical
              total={clinicalStatus.data?.total}
              storageKey="statistics-clinical-status-view"
              isLoading={clinicalStatus.isLoading}
              isError={clinicalStatus.isError}
              onRetry={() => clinicalStatus.refetch()}
              emptyMessage="No documented values for this metric in the selected period."
            />

            <AnalyticsCard
              title="Oxygen Support"
              summary={o2Support.data ? `n=${o2Support.data.total} documented` : undefined}
              data={o2Support.data ? valueCountsChartData(o2Support.data) : []}
              allowedViews={['bar', 'donut', 'table']}
              defaultView="bar"
              categorical
              total={o2Support.data?.total}
              storageKey="statistics-o2-support-view"
              isLoading={o2Support.isLoading}
              isError={o2Support.isError}
              onRetry={() => o2Support.refetch()}
              emptyMessage="No documented values for this metric in the selected period."
            />
          </div>
        </>
      )}
    </>
  )
}
