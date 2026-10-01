import type { APIRequestContext } from '@playwright/test'

/**
 * Roster people leave the not-yet-added list once added (create on Add,
 * 2026-10-01), so any e2e test that adds one must delete the stay again or
 * repeat runs would exhaust the mock roster's fixed set.
 */
export async function deleteStayByVisitId(request: APIRequestContext, erVisitId: string | null) {
  if (!erVisitId) return
  const res = await request.get('/api/patients/list')
  if (!res.ok()) return
  const body = await res.json()
  const rows: Array<{ stay_id: number; er_visit_id?: string | null }> = Array.isArray(body) ? body : body.patients ?? []
  for (const row of rows.filter((r) => String(r.er_visit_id) === String(erVisitId))) {
    await request.delete(`/api/patients/delete/${row.stay_id}`).catch(() => {})
  }
}
