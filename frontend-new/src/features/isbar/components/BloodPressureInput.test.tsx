import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { BloodPressureInput } from './BloodPressureInput'

function ControlledBloodPressure({ onSbpChange, onDbpChange }: { onSbpChange: (v: number | undefined) => void; onDbpChange: (v: number | undefined) => void }) {
  const [sbp, setSbp] = useState<number | undefined>(undefined)
  const [dbp, setDbp] = useState<number | undefined>(undefined)
  return (
    <BloodPressureInput
      sbpId="sbp"
      dbpId="dbp"
      sbpValue={sbp}
      dbpValue={dbp}
      onSbpChange={(v) => {
        setSbp(v)
        onSbpChange(v)
      }}
      onDbpChange={(v) => {
        setDbp(v)
        onDbpChange(v)
      }}
    />
  )
}

describe('BloodPressureInput', () => {
  it('stores SBP and DBP as separate values, not merged into one', async () => {
    const user = userEvent.setup()
    const onSbpChange = vi.fn()
    const onDbpChange = vi.fn()
    render(<ControlledBloodPressure onSbpChange={onSbpChange} onDbpChange={onDbpChange} />)

    await user.type(screen.getByLabelText('Systolic BP (mmHg)'), '120')
    await user.type(screen.getByLabelText('Diastolic BP (mmHg)'), '80')

    expect(onSbpChange).toHaveBeenLastCalledWith(120)
    expect(onDbpChange).toHaveBeenLastCalledWith(80)
  })

  it('reports undefined (not NaN or 0) when a field is cleared', async () => {
    const user = userEvent.setup()
    const onSbpChange = vi.fn()
    render(<BloodPressureInput sbpId="sbp" dbpId="dbp" sbpValue={120} dbpValue={80} onSbpChange={onSbpChange} onDbpChange={() => {}} />)

    await user.clear(screen.getByLabelText('Systolic BP (mmHg)'))
    expect(onSbpChange).toHaveBeenLastCalledWith(undefined)
  })

  it('renders the mmHg unit', () => {
    render(<BloodPressureInput sbpId="sbp" dbpId="dbp" sbpValue={undefined} dbpValue={undefined} onSbpChange={() => {}} onDbpChange={() => {}} />)
    expect(screen.getByText('mmHg')).toBeInTheDocument()
  })
})
