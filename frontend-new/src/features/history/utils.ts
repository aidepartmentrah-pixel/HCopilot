import type { LogPatient } from '@/types/history'

export interface HistoryFilters {
  search: string
  acuity: string
  bed: string
  dateFrom: string
  dateTo: string
}

export const emptyHistoryFilters: HistoryFilters = { search: '', acuity: '', bed: '', dateFrom: '', dateTo: '' }

/**
 * GET /api/data/log-patients/list takes no query params at all
 * (log_patients_manager.get_all() is unfiltered) — confirmed in NF2's
 * audit, matching the ER UI Architecture Redesign's own UI-C5 finding.
 * Every filter here is client-side against the already-loaded list.
 */
export function filterHistory(patients: LogPatient[], filters: HistoryFilters): LogPatient[] {
  return patients.filter((p) => {
    if (filters.search) {
      const q = filters.search.toLowerCase()
      const haystack = [p.name, String(p.stay_id), String(p.subject_id), p.chiefcomplaint].filter(Boolean).join(' ').toLowerCase()
      if (!haystack.includes(q)) return false
    }
    if (filters.acuity && String(p.acuity ?? '') !== filters.acuity) return false
    if (filters.bed && !bedHistoryIncludes(p.bed_history, filters.bed)) return false
    if (filters.dateFrom && (!p.arrival_time || p.arrival_time < filters.dateFrom)) return false
    if (filters.dateTo && (!p.arrival_time || p.arrival_time > filters.dateTo)) return false
    return true
  })
}

function bedHistoryIncludes(bedHistory: string | null, bed: string): boolean {
  if (!bedHistory) return false
  return bedHistory
    .split(',')
    .map((b) => b.trim())
    .includes(bed)
}

/** Distinct bed numbers actually present in bed_history, for the Bed filter's options. */
export function collectBedOptions(patients: LogPatient[]): string[] {
  const beds = new Set<string>()
  for (const p of patients) {
    if (!p.bed_history) continue
    for (const b of p.bed_history.split(',')) {
      const trimmed = b.trim()
      if (trimmed) beds.add(trimmed)
    }
  }
  return Array.from(beds).sort()
}
