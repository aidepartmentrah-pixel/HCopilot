import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useChartViewPreference } from './useChartViewPreference'

describe('useChartViewPreference', () => {
  const KEY = 'test-chart-view'

  afterEach(() => {
    localStorage.removeItem(KEY)
  })

  it('uses defaultView when nothing is stored and no storageKey is given', () => {
    const { result } = renderHook(() => useChartViewPreference(undefined, 'bar', ['bar', 'line', 'table']))
    expect(result.current[0]).toBe('bar')
  })

  it('restores a previously-stored valid view', () => {
    localStorage.setItem(KEY, 'line')
    const { result } = renderHook(() => useChartViewPreference(KEY, 'bar', ['bar', 'line', 'table']))
    expect(result.current[0]).toBe('line')
  })

  it('falls back to defaultView when the stored value is no longer in allowedViews', () => {
    localStorage.setItem(KEY, 'donut')
    const { result } = renderHook(() => useChartViewPreference(KEY, 'bar', ['bar', 'line', 'table']))
    expect(result.current[0]).toBe('bar')
  })

  it('persists a change under storageKey when one is given', () => {
    const { result } = renderHook(() => useChartViewPreference(KEY, 'bar', ['bar', 'line', 'table']))
    act(() => result.current[1]('line'))
    expect(result.current[0]).toBe('line')
    expect(localStorage.getItem(KEY)).toBe('line')
  })

  it('never writes to localStorage when no storageKey is given', () => {
    const { result } = renderHook(() => useChartViewPreference(undefined, 'bar', ['bar', 'line', 'table']))
    act(() => result.current[1]('line'))
    expect(localStorage.getItem(KEY)).toBeNull()
  })
})
