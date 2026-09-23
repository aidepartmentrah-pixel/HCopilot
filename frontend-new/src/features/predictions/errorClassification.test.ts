import { describe, expect, it } from 'vitest'
import { ApiError } from '@/api/client'
import { classifyForecastError } from './errorClassification'

describe('classifyForecastError', () => {
  it('classifies the real "Model file not found" 404 as no-model', () => {
    expect(classifyForecastError(new ApiError(404, JSON.stringify({ detail: 'Model file not found' })))).toBe('no-model')
  })

  it('classifies the real "dataset is empty" 404 as insufficient-data', () => {
    expect(classifyForecastError(new ApiError(404, JSON.stringify({ detail: 'HistoricalEdStays dataset is empty' })))).toBe(
      'insufficient-data',
    )
  })

  it('falls back to unknown for an unrecognized 404 detail rather than guessing', () => {
    expect(classifyForecastError(new ApiError(404, JSON.stringify({ detail: 'Something else entirely' })))).toBe('unknown')
  })

  it('falls back to unknown for a 500 (a real, unexpected server error)', () => {
    expect(classifyForecastError(new ApiError(500, JSON.stringify({ detail: 'list index out of range' })))).toBe('unknown')
  })

  it('falls back to unknown for a non-ApiError', () => {
    expect(classifyForecastError(new Error('network down'))).toBe('unknown')
  })

  it('handles a non-JSON error body without throwing', () => {
    expect(classifyForecastError(new ApiError(404, 'Not Found'))).toBe('unknown')
  })
})
