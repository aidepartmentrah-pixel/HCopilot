function getByPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[key] : undefined), obj)
}

function isEmpty(value: unknown): boolean {
  if (value === undefined || value === null) return true
  if (typeof value === 'string') return value.trim() === ''
  if (typeof value === 'boolean') return value === false
  return false
}

/** True if any field in this section has a real value — used to tell "not started" apart from "attempted but incomplete". */
export function hasAnyValue(values: unknown, fieldPaths: string[]): boolean {
  return fieldPaths.some((path) => !isEmpty(getByPath(values, path)))
}
