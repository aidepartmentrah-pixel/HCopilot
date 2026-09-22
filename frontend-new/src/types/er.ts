/**
 * One row from GET /api/hospital-directory/er/current-visits — the live ER
 * roster (ER Live-Roster Redesign). `er_visit_id` is the only field callers
 * should key on; gender/age/chief_complaint are optional, unconfirmed-shape
 * fields per the backend's own client.py docstring (a vendor shape that has
 * already been wrong once for this contract) — never treat them as required
 * or guaranteed-present.
 */
export interface ErRosterItem {
  er_visit_id: string
  first_name?: string | null
  father_name?: string | null
  last_name?: string | null
  gender?: string | null
  age?: number | null
  arrival_time?: string | null
  chief_complaint?: string | null
}

export interface ErRosterResponse {
  success: boolean
  status: 'ok' | string
  message?: string
  items: ErRosterItem[]
  total?: number
}
