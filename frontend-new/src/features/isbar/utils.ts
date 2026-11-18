/**
 * Map an external gender/sex value to HCopilot's own "Male"/"Female". The
 * backend already maps the ER API's (v1.2) Arabic labels — ذكر -> Male,
 * انثى -> Female — but the Arabic values are accepted here too, as a safety
 * net. Anything else (a raw vendor code, null) is left blank rather than
 * guessed, matching the old frontend's `_mapDirectorySexToGender` caution.
 */
export function mapExternalGender(raw: string | null | undefined): string {
  const v = (raw ?? '').trim().toLowerCase()
  if (v === 'male' || v === 'm' || v === 'ذكر') return 'Male'
  if (v === 'female' || v === 'f' || v === 'انثى' || v === 'أنثى') return 'Female'
  return ''
}

/** Placeholder shown when the ER API sends no name parts at all (every name field may be null in v1.2). */
export const UNNAMED_PATIENT = 'Unnamed patient'

type ErNameParts = { first_name?: string | null; father_name?: string | null; last_name?: string | null }

/** "first father last", skipping null/blank parts — '' when the ER API sent no name at all. */
export function erRosterFullName(item: ErNameParts): string {
  return [item.first_name, item.father_name, item.last_name].map((p) => (p ?? '').trim()).filter(Boolean).join(' ')
}

/** Display name for a roster row: the full name, or the placeholder when there is none. */
export function erRosterName(item: ErNameParts): string {
  return erRosterFullName(item) || UNNAMED_PATIENT
}

/** Roster row meta line: "48 y · Male · chest pain" — only the parts that are present. */
export function erRosterMeta(item: { age?: number | null; gender?: string | null; chief_complaint?: string | null }): string {
  const gender = mapExternalGender(item.gender)
  return [item.age != null ? `${item.age} y` : null, gender || null, item.chief_complaint || null].filter(Boolean).join(' · ') || '—'
}
