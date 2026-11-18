/**
 * One row from GET /api/hospital-directory/er/current-visits — HCopilot's
 * proxy of 3iSoft's separate ER API (v1.2). `er_visit_id` is the only field
 * callers should key on. Every other field may be null, INCLUDING the names.
 * The backend normalizes the vendor values: `gender` is "Male" | "Female" |
 * null (the raw value is kept in `gender_raw`), and `arrival_time` is local
 * wall-clock without an offset (the original is in `arrival_time_raw`).
 */
export interface ErRosterItem {
  er_visit_id: string
  first_name?: string | null
  father_name?: string | null
  last_name?: string | null
  gender?: string | null
  gender_raw?: string | null
  age?: number | null
  arrival_time?: string | null
  arrival_time_raw?: string | null
  chief_complaint?: string | null
}

export interface ErRosterResponse {
  success: boolean
  /** 'roster_off' = the admin's "Live ER roster" switch is off (not an error). */
  status: 'ok' | 'roster_off' | string
  message?: string
  items: ErRosterItem[]
  total?: number
}
