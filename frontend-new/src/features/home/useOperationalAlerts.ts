import { useMemo } from 'react'
import { useErRoster } from '@/hooks/useErRoster'
import { usePatients } from '@/hooks/usePatients'
import { useBedStats } from '@/hooks/useBeds'
import { classifyOccupancy, findPatientsAwaitingIsbar, rosterFeedAlert } from './alertRules'
import type { OperationalAlert } from './alertRules'

/**
 * Combines the three real alert rules (Dashboard spec §9) with the live
 * data those rules need. Shared by OperationalAlertsPanel (Home) and the
 * shell's NotificationBell — one source of truth for "what's wrong right
 * now", not two independently-maintained copies.
 */
export function useOperationalAlerts(): { alerts: OperationalAlert[]; isLoading: boolean } {
  const roster = useErRoster()
  const patients = usePatients()
  const bedStats = useBedStats()

  const alerts = useMemo<OperationalAlert[]>(() => {
    const now = new Date()
    const result: OperationalAlert[] = []

    if (roster.data?.status === 'ok' && patients.data) {
      const awaiting = findPatientsAwaitingIsbar(roster.data.items, patients.data.patients, now)
      if (awaiting.length > 0) {
        result.push({
          id: 'awaiting-isbar',
          severity: 'warning',
          message: `${awaiting.length} new patient${awaiting.length === 1 ? '' : 's'} waiting > 5 min — ISBAR entry has not yet been started.`,
        })
      }
    }

    if (bedStats.data) {
      const severity = classifyOccupancy(bedStats.data.occupancy_rate)
      if (severity) {
        result.push({
          id: 'high-occupancy',
          severity,
          message: `High ER occupancy — ${bedStats.data.occupancy_rate}% of beds are currently occupied.`,
        })
      }
    }

    const feedAlert = rosterFeedAlert(roster.data, roster.isError, roster.dataUpdatedAt, now)
    if (feedAlert) result.push(feedAlert)

    return result
  }, [roster.data, roster.isError, roster.dataUpdatedAt, patients.data, bedStats.data])

  return { alerts, isLoading: roster.isLoading || patients.isLoading || bedStats.isLoading }
}
