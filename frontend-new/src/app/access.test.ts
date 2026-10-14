import { describe, expect, it } from 'vitest'
import type { AuthUser } from '@/types/auth'
import { SECTION_KEYS, canAccessSection, canAccessSettingsArea } from './access'

const user = (over: Partial<AuthUser>): AuthUser => ({
  user_id: 1,
  username: 'u',
  name: '',
  role: 'user',
  sections: '',
  settings_tabs: '',
  statistics_tabs: '',
  ...over,
})

describe('canAccessSection', () => {
  it('lets admins open everything', () => {
    expect(canAccessSection(user({ role: 'admin' }), SECTION_KEYS.settings)).toBe(true)
  })

  it('always lets a signed-in user open Home', () => {
    expect(canAccessSection(user({}), SECTION_KEYS.home)).toBe(true)
  })

  it('opens only the granted sections, using the old UI keys', () => {
    const u = user({ sections: 'patients,beds-display' })
    expect(canAccessSection(u, SECTION_KEYS.isbar)).toBe(true) // ER ISBAR Entry = "patients"
    expect(canAccessSection(u, SECTION_KEYS.liveEr)).toBe(true) // Live ER = "beds-display"
    expect(canAccessSection(u, SECTION_KEYS.history)).toBe(false)
    expect(canAccessSection(u, SECTION_KEYS.predictions)).toBe(false)
  })

  it('denies everything for nobody signed in', () => {
    expect(canAccessSection(null, SECTION_KEYS.home)).toBe(false)
  })
})

describe('canAccessSettingsArea', () => {
  it('needs the Settings section AND a matching settings tab', () => {
    expect(canAccessSettingsArea(user({ sections: 'settings', settings_tabs: 'beds' }), ['beds'])).toBe(true)
    expect(canAccessSettingsArea(user({ sections: 'settings', settings_tabs: 'beds' }), ['doctors'])).toBe(false)
    expect(canAccessSettingsArea(user({ sections: 'patients', settings_tabs: 'beds' }), ['beds'])).toBe(false)
  })

  it('opens AI & Models with either the models or the training key', () => {
    expect(canAccessSettingsArea(user({ sections: 'settings', settings_tabs: 'training' }), ['models', 'training'])).toBe(true)
  })

  it('opens everything for admins', () => {
    expect(canAccessSettingsArea(user({ role: 'admin' }), ['hospital-directory'])).toBe(true)
  })
})
