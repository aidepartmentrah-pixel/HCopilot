/**
 * Centralized clinical date formatting (History spec §14 — "Do not
 * implement separate date formatting logic in each table cell"). Backend
 * timestamps like "2026-06-12T16:35" become "12 Jun 2026, 16:35".
 */
export function formatClinicalDate(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  // Fixed 'en-GB' locale, not the runtime default: this renders on hospital
  // workstations with whatever OS locale is configured, and the spec's
  // exact "12 Jun 2026, 16:35" day-month-year order must stay the same
  // everywhere rather than silently reordering per machine.
  const datePart = date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  const timePart = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
  return `${datePart}, ${timePart}`
}
