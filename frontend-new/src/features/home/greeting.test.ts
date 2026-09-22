import { describe, expect, it } from 'vitest'
import { getGreeting } from './greeting'

describe('getGreeting', () => {
  it('is Good Morning before noon', () => {
    expect(getGreeting(new Date('2026-09-22T09:00:00'))).toBe('Good Morning')
  })
  it('is Good Afternoon from noon to before 6pm', () => {
    expect(getGreeting(new Date('2026-09-22T13:30:00'))).toBe('Good Afternoon')
  })
  it('is Good Evening from 6pm onward', () => {
    expect(getGreeting(new Date('2026-09-22T19:00:00'))).toBe('Good Evening')
  })
})
