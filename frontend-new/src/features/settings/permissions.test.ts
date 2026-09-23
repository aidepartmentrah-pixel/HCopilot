import { describe, expect, it } from 'vitest'
import { SECTION_PERMISSIONS, grantAllKnownKeys, hasKey, parseKeys, serializeKeys, toggleKey } from './permissions'

describe('parseKeys', () => {
  it('splits, trims, and drops empties', () => {
    expect(parseKeys('home, patients ,,statistics')).toEqual(new Set(['home', 'patients', 'statistics']))
  })

  it('returns an empty set for an empty string', () => {
    expect(parseKeys('')).toEqual(new Set())
  })
})

describe('serializeKeys', () => {
  it('joins a set back to a comma-separated string', () => {
    expect(serializeKeys(new Set(['home', 'statistics']))).toBe('home,statistics')
  })
})

describe('hasKey', () => {
  it('is true only for an exact key match, not a substring', () => {
    expect(hasKey('beds-display,statistics', 'beds-display')).toBe(true)
    expect(hasKey('beds-display,statistics', 'beds')).toBe(false)
  })
})

describe('toggleKey', () => {
  it('adds a key that was not present', () => {
    expect(toggleKey('home,statistics', 'patients', true)).toBe('home,statistics,patients')
  })

  it('removes a key that was present', () => {
    expect(toggleKey('home,statistics,patients', 'statistics', false)).toBe('home,patients')
  })

  it('is a no-op when enabling an already-present key', () => {
    expect(toggleKey('home,statistics', 'home', true)).toBe('home,statistics')
  })

  it('is a no-op when disabling an already-absent key', () => {
    expect(toggleKey('home,statistics', 'patients', false)).toBe('home,statistics')
  })

  it('preserves real old-frontend-only keys this editor renders no checkbox for', () => {
    // A shared account with 'scheduling'/'simulation' access from the old
    // frontend — toggling an unrelated new-frontend key must not drop them.
    const before = 'beds-display,scheduling,simulation,settings'
    const after = toggleKey(before, 'statistics', true)
    expect(after).toContain('scheduling')
    expect(after).toContain('simulation')
    expect(hasKey(after, 'statistics')).toBe(true)
  })

  it('preserves a legacy reset key on settings_tabs rather than silently stripping it', () => {
    const before = 'beds,doctors,reset'
    const after = toggleKey(before, 'wards', true)
    expect(hasKey(after, 'reset')).toBe(true)
    expect(hasKey(after, 'wards')).toBe(true)
  })
})

describe('grantAllKnownKeys', () => {
  it('adds every option key from an empty string — fixing the real backend gap where sections has no admin auto-fill', () => {
    const result = grantAllKnownKeys('', SECTION_PERMISSIONS)
    for (const opt of SECTION_PERMISSIONS) expect(hasKey(result, opt.key)).toBe(true)
  })

  it('preserves an already-present legacy key not represented by any option', () => {
    const result = grantAllKnownKeys('scheduling', SECTION_PERMISSIONS)
    expect(hasKey(result, 'scheduling')).toBe(true)
    expect(hasKey(result, 'home')).toBe(true)
  })
})
