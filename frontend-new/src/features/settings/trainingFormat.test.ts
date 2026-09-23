import { describe, expect, it } from 'vitest'
import { formatMetric, runStatusLabel, runStatusTone, shortenRunId } from './trainingFormat'

describe('runStatusLabel / runStatusTone', () => {
  it('maps each real backend status to a label and tone', () => {
    expect(runStatusLabel('completed')).toBe('Completed')
    expect(runStatusTone('completed')).toBe('success')
    expect(runStatusLabel('failed')).toBe('Failed')
    expect(runStatusTone('failed')).toBe('danger')
    expect(runStatusLabel('running')).toBe('Running')
    expect(runStatusTone('running')).toBe('brand')
  })
})

describe('formatMetric', () => {
  it('formats a real value to the given decimal precision', () => {
    expect(formatMetric(0.367194093156762, 3)).toBe('0.367')
  })

  it('shows an em-dash for a null metric instead of a fabricated 0', () => {
    expect(formatMetric(null)).toBe('—')
  })

  it('displays a real anomalous value faithfully, never capped or rounded away', () => {
    // The real backend value observed for a live run (V2.6 smoke test) —
    // an enormous MAPE the frontend must show as-is, per §23.
    expect(formatMetric(1924132467.6234164, 1)).toBe('1924132467.6')
  })
})

describe('shortenRunId', () => {
  it('truncates a long run id with an ellipsis', () => {
    expect(shortenRunId('20260918T084241Z_2f6edd84')).toBe('20260918T084241…')
  })

  it('leaves a short id untouched', () => {
    expect(shortenRunId('run-1')).toBe('run-1')
  })
})
