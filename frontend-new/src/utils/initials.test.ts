import { describe, expect, it } from 'vitest'
import { initialsOf } from './initials'

describe('initialsOf', () => {
  it('takes first and last initials for a multi-word name', () => {
    expect(initialsOf('Jamie Smith')).toBe('JS')
  })

  it('uses the single initial for a one-word name', () => {
    expect(initialsOf('Administrator')).toBe('A')
  })

  it('degrades to a single ? for a blank name', () => {
    expect(initialsOf('')).toBe('?')
    expect(initialsOf('   ')).toBe('?')
  })

  it('collapses extra whitespace between name parts', () => {
    expect(initialsOf('  Jamie   Lee   Smith ')).toBe('JS')
  })
})
