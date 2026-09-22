/**
 * Spread into register()'s options for every optional numeric field —
 * converts an empty input to `undefined` (not `NaN`, which z.number()
 * correctly rejects) before Zod ever validates it. Keeps the Zod schema's
 * input/output types identical (see schema.ts's own note on why
 * z.preprocess broke the resolver's types).
 */
export const numericFieldOptions = {
  setValueAs: (v: string) => (v === '' || v == null ? undefined : Number(v)),
}

export const GENDER_OPTIONS = ['Male', 'Female', 'Other'] as const

export const ACUITY_OPTIONS = [
  { value: 1, label: '1 — Immediate' },
  { value: 2, label: '2 — Emergent' },
  { value: 3, label: '3 — Urgent' },
  { value: 4, label: '4 — Less Urgent' },
  { value: 5, label: '5 — Non-Urgent' },
] as const

/** Semantic tone per ESI level — matches StatusBadge's tone vocabulary, not an arbitrary new palette. */
export const ACUITY_TONE: Record<number, 'critical' | 'danger' | 'warning' | 'neutral' | 'success'> = {
  1: 'critical',
  2: 'danger',
  3: 'warning',
  4: 'neutral',
  5: 'success',
}
