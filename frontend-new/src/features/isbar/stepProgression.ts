export type SectionStatus = 'not-started' | 'in-progress' | 'complete' | 'missing-required'

export interface SectionState {
  id: string
  status: SectionStatus
}

/**
 * The section that should be open/active right now (ISBAR spec §8/§9):
 * the first section, in order, that isn't yet complete. Everything before
 * it is complete and collapsed by default; everything after it hasn't
 * been reached. Previously-complete sections can still be reopened
 * manually — that's a separate concern (open/closed UI state), not this
 * function's job.
 */
export function getCurrentSectionId(sections: SectionState[]): string | null {
  const next = sections.find((s) => s.status !== 'complete')
  return next ? next.id : null
}

/** True once every section is complete (§10 — gates the final submit label/emphasis, not required to save a draft). */
export function isWorkflowComplete(sections: SectionState[]): boolean {
  return sections.length > 0 && sections.every((s) => s.status === 'complete')
}
