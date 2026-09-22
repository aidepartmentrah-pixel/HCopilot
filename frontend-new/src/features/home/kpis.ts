import type { LogPatient } from '@/types/history'

/** "Discharged Today" (Dashboard spec §5 KPI 4) — local calendar day, not a rolling 24h window. */
export function countDischargedToday(logPatients: LogPatient[], now: Date): number {
  const todayKey = now.toDateString()
  return logPatients.filter((p) => p.departure_time && new Date(p.departure_time).toDateString() === todayKey).length
}
