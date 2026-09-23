/**
 * Minutes since a bedless patient's arrival — real elapsed time, purely
 * from `arrival_time` (Live ER spec §16). Not gated on `triage_time`: this
 * page's "waiting" KPI is about bed placement, not ISBAR/triage status —
 * see utils.ts's own note on the §5 mislabeling fix.
 */
export function minutesSinceArrival(arrivalTime: string, now: Date = new Date()): number | null {
  const arrival = new Date(arrivalTime).getTime()
  if (Number.isNaN(arrival)) return null
  const minutes = (now.getTime() - arrival) / 60000
  return minutes < 0 ? null : minutes
}

/**
 * "Waiting 08 min" / "1 h 12 min" — the spec explicitly calls out a real
 * old-frontend bug this must never reproduce: a malformed value like
 * "Waiting 20814m" from a stale/test timestamp (§16).
 */
export function formatWaitingDuration(minutes: number | null): string {
  if (minutes == null || !Number.isFinite(minutes) || minutes < 0) return '—'
  const totalMinutes = Math.floor(minutes)
  const hours = Math.floor(totalMinutes / 60)
  const mins = totalMinutes % 60
  if (hours === 0) return `${String(mins).padStart(2, '0')} min`
  return `${hours} h ${mins} min`
}
