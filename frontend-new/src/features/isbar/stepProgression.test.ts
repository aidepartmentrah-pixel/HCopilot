import { describe, expect, it } from 'vitest'
import { getCurrentSectionId, isWorkflowComplete } from './stepProgression'
import type { SectionState } from './stepProgression'

function sections(overrides: Partial<Record<string, SectionState['status']>>): SectionState[] {
  const order = ['patient-arrival', 'vitals', 'situation', 'background', 'focused-assessment', 'recommendation']
  return order.map((id) => ({ id, status: overrides[id] ?? 'not-started' }))
}

describe('getCurrentSectionId', () => {
  it('is the first section when nothing is complete yet', () => {
    expect(getCurrentSectionId(sections({}))).toBe('patient-arrival')
  })

  it('advances to the next section once the previous ones are complete', () => {
    expect(getCurrentSectionId(sections({ 'patient-arrival': 'complete', vitals: 'complete' }))).toBe('situation')
  })

  it('stays on a section with missing required fields rather than skipping it', () => {
    expect(getCurrentSectionId(sections({ 'patient-arrival': 'missing-required' }))).toBe('patient-arrival')
  })

  it('is null once every section is complete', () => {
    const all = sections({
      'patient-arrival': 'complete',
      vitals: 'complete',
      situation: 'complete',
      background: 'complete',
      'focused-assessment': 'complete',
      recommendation: 'complete',
    })
    expect(getCurrentSectionId(all)).toBeNull()
  })

  it('a later section going back to incomplete after an edit reclaims "current" even if earlier sections are complete', () => {
    // §30 — reopening a complete section and invalidating it should make it current again.
    expect(getCurrentSectionId(sections({ 'patient-arrival': 'complete', vitals: 'missing-required', situation: 'complete' }))).toBe(
      'vitals',
    )
  })
})

describe('isWorkflowComplete', () => {
  it('is false with any incomplete section', () => {
    expect(isWorkflowComplete(sections({ 'patient-arrival': 'complete' }))).toBe(false)
  })

  it('is true only when every section is complete', () => {
    const all = sections({
      'patient-arrival': 'complete',
      vitals: 'complete',
      situation: 'complete',
      background: 'complete',
      'focused-assessment': 'complete',
      recommendation: 'complete',
    })
    expect(isWorkflowComplete(all)).toBe(true)
  })
})
