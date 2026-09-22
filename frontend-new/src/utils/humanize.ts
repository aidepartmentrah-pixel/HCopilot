/** snake_case/lower-case backend token → Title Case display text (e.g. "chest_pain" -> "Chest Pain"). */
export function humanize(token: string): string {
  return token.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}
