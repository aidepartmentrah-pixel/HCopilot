import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DateTimeInput, toLocalDatetimeString } from './DateTimeInput'

describe('toLocalDatetimeString', () => {
  it('formats local wall-clock time, not UTC', () => {
    expect(toLocalDatetimeString(new Date(2026, 9, 14, 9, 5))).toBe('2026-10-14T09:05')
  })
})

describe('DateTimeInput', () => {
  it('shows a single visible, labelable control with a readable value', () => {
    render(
      <>
        <label htmlFor="when">When</label>
        <DateTimeInput id="when" value="2026-10-14T21:30" onChange={() => {}} />
      </>,
    )
    const input = screen.getByLabelText('When') as HTMLInputElement
    expect(input.readOnly).toBe(true)
    expect(input.value).toMatch(/Oct 14, 2026/)
    expect(input.value).toMatch(/9:30 PM/)
  })

  it('can be disabled', () => {
    render(<DateTimeInput id="d" value="" onChange={() => {}} disabled />)
    expect((document.getElementById('d') as HTMLInputElement).disabled).toBe(true)
  })
})
