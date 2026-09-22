import { useCallback, useEffect, useRef, useState } from 'react'
import type { UseFormReturn } from 'react-hook-form'
import { hasAnyValue } from './sectionDirty'
import { SECTION_FIELDS, SECTION_ORDER } from './sectionFields'
import type { SectionId } from './sectionFields'
import type { IsbarFormValues } from './schema'
import { getCurrentSectionId } from './stepProgression'
import type { SectionStatus } from './stepProgression'

function blankStatuses(): Record<SectionId, SectionStatus> {
  return Object.fromEntries(SECTION_ORDER.map((id) => [id, 'not-started'])) as Record<SectionId, SectionStatus>
}

/** Every field in every section is registered with its react-hook-form path as its DOM id (see each Section component) — reverse that to find which section owns a blurred element. */
function sectionOwning(fieldId: string): SectionId | null {
  for (const id of SECTION_ORDER) {
    if (SECTION_FIELDS[id].includes(fieldId as never)) return id
  }
  return null
}

/**
 * Owns the 6-section workflow state: status per section, which are open,
 * and which is "current" (ISBAR spec §7-9, §29-30). `resetKey` should
 * change whenever a different patient/draft loads, so a status from the
 * previous record never leaks into the next one.
 *
 * Async re-validation of an already-attempted section runs on blur, not on
 * every keystroke. A keystroke-driven (even debounced) version was tried
 * first and, confirmed in practice, could fire overlapping `trigger()`
 * calls — typing fast, or a field change immediately followed by clicking
 * Continue — where a stale call resolves after a newer one and clobbers
 * its result. Blur events are naturally sparse and don't overlap that way.
 */
export function useSectionStatuses(methods: UseFormReturn<IsbarFormValues>, resetKey: string | number) {
  const [statuses, setStatuses] = useState<Record<SectionId, SectionStatus>>(blankStatuses)
  const [openSections, setOpenSections] = useState<Set<SectionId>>(new Set(['patient-arrival']))
  const [attempted, setAttempted] = useState<Set<SectionId>>(new Set())
  const generationRef = useRef(0)
  const attemptedRef = useRef(attempted)
  attemptedRef.current = attempted

  // Re-seed whenever a new patient/draft loads: a section with pre-existing
  // saved data shows its real state immediately (complete/missing), not a
  // false "not started".
  useEffect(() => {
    const generation = ++generationRef.current
    ;(async () => {
      const values = methods.getValues()
      const next = blankStatuses()
      const nowAttempted = new Set<SectionId>()
      for (const id of SECTION_ORDER) {
        if (!hasAnyValue(values, SECTION_FIELDS[id])) continue
        nowAttempted.add(id)
        const valid = await methods.trigger(SECTION_FIELDS[id])
        if (generationRef.current !== generation) return
        next[id] = valid ? 'complete' : 'missing-required'
      }
      if (generationRef.current !== generation) return
      setStatuses(next)
      setAttempted(nowAttempted)
      const current = getCurrentSectionId(SECTION_ORDER.map((id) => ({ id, status: next[id] }))) as SectionId | null
      setOpenSections(new Set(current ? [current] : []))
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey])

  // Cheap, synchronous, and re-render-driven only (no `trigger()`, so no
  // async race is possible here): flips an untouched open section from
  // not-started to in-progress as soon as it has any value (§8).
  const watchedJson = JSON.stringify(methods.watch())
  useEffect(() => {
    const values = methods.getValues()
    for (const id of openSections) {
      if (attempted.has(id)) continue
      if (statuses[id] === 'not-started' && hasAnyValue(values, SECTION_FIELDS[id])) {
        setStatuses((prev) => (prev[id] === 'not-started' ? { ...prev, [id]: 'in-progress' } : prev))
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedJson])

  /** Re-validates one already-attempted section and applies the result only if nothing newer has started since (§30). */
  const revalidateIfAttempted = useCallback(
    async (id: SectionId) => {
      if (!attemptedRef.current.has(id)) return
      const generation = ++generationRef.current
      const valid = await methods.trigger(SECTION_FIELDS[id])
      if (generationRef.current !== generation) return
      const status: SectionStatus = valid ? 'complete' : 'missing-required'
      setStatuses((prev) => (prev[id] === status ? prev : { ...prev, [id]: status }))
    },
    [methods],
  )

  /** Attach to the workspace `<form>`'s onBlur (React bubbles synthetic blur) — re-validates whichever section the blurred field belongs to. */
  const onWorkspaceBlur = useCallback(
    (e: React.FocusEvent<HTMLElement>) => {
      const fieldId = e.target.id
      const owner = fieldId ? sectionOwning(fieldId) : null
      if (owner) void revalidateIfAttempted(owner)
    },
    [revalidateIfAttempted],
  )

  const currentId = getCurrentSectionId(SECTION_ORDER.map((id) => ({ id, status: statuses[id] }))) as SectionId | null

  const toggleSection = useCallback(
    (id: SectionId, open: boolean) => {
      setOpenSections((prev) => {
        const next = new Set(prev)
        if (open) next.add(id)
        else next.delete(id)
        return next
      })
      // Reopening a previously-attempted section re-checks it immediately, rather than waiting for the first blur inside it.
      if (open) void revalidateIfAttempted(id)
    },
    [revalidateIfAttempted],
  )

  /** Returns the next section's id to scroll to, or null if validation failed / this was the last section. */
  const handleContinue = useCallback(
    async (id: SectionId) => {
      const generation = ++generationRef.current
      const valid = await methods.trigger(SECTION_FIELDS[id])
      if (generationRef.current !== generation) return null
      setAttempted((prev) => new Set(prev).add(id))
      setStatuses((prev) => ({ ...prev, [id]: valid ? 'complete' : 'missing-required' }))
      if (!valid) return null

      const idx = SECTION_ORDER.indexOf(id)
      const nextId = SECTION_ORDER[idx + 1] as SectionId | undefined
      setOpenSections((prev) => {
        const next = new Set(prev)
        next.delete(id)
        if (nextId) next.add(nextId)
        return next
      })
      return nextId ?? null
    },
    [methods],
  )

  return { statuses, openSections, currentId, toggleSection, handleContinue, onWorkspaceBlur }
}
