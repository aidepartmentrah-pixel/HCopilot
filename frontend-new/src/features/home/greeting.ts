/** Time-based greeting (Dashboard spec §4) — hours are local wall-clock time. */
export function getGreeting(date: Date): string {
  const hour = date.getHours()
  if (hour < 12) return 'Good Morning'
  if (hour < 18) return 'Good Afternoon'
  return 'Good Evening'
}
