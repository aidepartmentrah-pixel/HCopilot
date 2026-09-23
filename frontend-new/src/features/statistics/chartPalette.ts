/** Restrained categorical palette for multi-slice charts with no inherent semantic color (§26 "Multiple Neutral Categories"). Cycles rather than throws for a longer-than-expected category list. */
const CATEGORICAL_PALETTE = ['var(--brand-600)', 'var(--chart-blue)', 'var(--chart-teal)', 'var(--waiting)', 'var(--slate-500)']

export function categoricalColor(index: number): string {
  return CATEGORICAL_PALETTE[index % CATEGORICAL_PALETTE.length]
}
