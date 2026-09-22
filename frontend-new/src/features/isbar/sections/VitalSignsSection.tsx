import { useFormContext } from 'react-hook-form'
import { FormField } from '@/components/forms/FormField'
import { Input } from '@/components/forms/Input'
import { Select } from '@/components/forms/Select'
import { O2_SUPPORT_OPTIONS } from '@/types/isbar'
import { numericFieldOptions } from '../constants'
import type { IsbarFormValues } from '../schema'
import sectionStyles from './Section.module.css'

export function VitalSignsSection({ disabled }: { disabled: boolean }) {
  const {
    register,
    formState: { errors },
  } = useFormContext<IsbarFormValues>()

  return (
    <div className={sectionStyles.grid}>
      <FormField label="Temperature (°C)" htmlFor="temperature" error={errors.temperature?.message}>
        <Input id="temperature" type="number" step="0.1" disabled={disabled} invalid={!!errors.temperature} {...register('temperature', numericFieldOptions)} />
      </FormField>
      <FormField label="Heart Rate (bpm)" htmlFor="heartrate" error={errors.heartrate?.message}>
        <Input id="heartrate" type="number" disabled={disabled} invalid={!!errors.heartrate} {...register('heartrate', numericFieldOptions)} />
      </FormField>
      <FormField label="Respiratory Rate (/min)" htmlFor="resprate" error={errors.resprate?.message}>
        <Input id="resprate" type="number" disabled={disabled} invalid={!!errors.resprate} {...register('resprate', numericFieldOptions)} />
      </FormField>
      <FormField label="O2 Saturation (%)" htmlFor="o2sat" error={errors.o2sat?.message}>
        <Input id="o2sat" type="number" disabled={disabled} invalid={!!errors.o2sat} {...register('o2sat', numericFieldOptions)} />
      </FormField>
      <FormField label="Systolic BP (mmHg)" htmlFor="sbp" error={errors.sbp?.message}>
        <Input id="sbp" type="number" disabled={disabled} invalid={!!errors.sbp} {...register('sbp', numericFieldOptions)} />
      </FormField>
      <FormField label="Diastolic BP (mmHg)" htmlFor="dbp" error={errors.dbp?.message}>
        <Input id="dbp" type="number" disabled={disabled} invalid={!!errors.dbp} {...register('dbp', numericFieldOptions)} />
      </FormField>
      <FormField label="Pain (0-10 or description)" htmlFor="pain">
        <Input id="pain" disabled={disabled} {...register('pain')} />
      </FormField>
      <FormField label="Blood Glucose (mg/dL)" htmlFor="isbar.blood_glucose">
        <Input id="isbar.blood_glucose" type="number" disabled={disabled} {...register('isbar.blood_glucose', numericFieldOptions)} />
      </FormField>
      <FormField label="O2 Support" htmlFor="isbar.o2_support">
        <Select id="isbar.o2_support" disabled={disabled} placeholder="Select…" {...register('isbar.o2_support')}>
          {O2_SUPPORT_OPTIONS.map((o) => (
            <option key={o} value={o}>
              {o.replace(/_/g, ' ')}
            </option>
          ))}
        </Select>
      </FormField>
      <FormField label="O2 Flow Rate (L/min)" htmlFor="isbar.o2_flow_rate">
        <Input id="isbar.o2_flow_rate" type="number" disabled={disabled} {...register('isbar.o2_flow_rate', numericFieldOptions)} />
      </FormField>
      <FormField label="Vitals Recorded By" htmlFor="isbar.vitals_recorded_by">
        <Input id="isbar.vitals_recorded_by" disabled={disabled} {...register('isbar.vitals_recorded_by')} />
      </FormField>
      <FormField label="Vitals Measured At" htmlFor="isbar.vitals_measured_at">
        <Input id="isbar.vitals_measured_at" type="datetime-local" disabled={disabled} {...register('isbar.vitals_measured_at')} />
      </FormField>
    </div>
  )
}
