import { useController, useFormContext } from 'react-hook-form'
import { FormField } from '@/components/forms/FormField'
import { Input } from '@/components/forms/Input'
import { Select } from '@/components/forms/Select'
import { O2_SUPPORT_OPTIONS } from '@/types/isbar'
import { numericFieldOptions } from '../constants'
import { BloodPressureInput } from '../components/BloodPressureInput'
import { PainScaleSelector } from '../components/PainScaleSelector'
import { UnitInput } from '../components/UnitInput'
import type { IsbarFormValues } from '../schema'
import sectionStyles from './Section.module.css'

export function VitalSignsSection({ disabled }: { disabled: boolean }) {
  const {
    register,
    control,
    formState: { errors },
  } = useFormContext<IsbarFormValues>()
  const sbpField = useController({ name: 'sbp', control }).field
  const dbpField = useController({ name: 'dbp', control }).field
  const painField = useController({ name: 'pain', control }).field

  return (
    <div className={sectionStyles.grid}>
      <FormField label="Temperature (°C)" htmlFor="temperature" error={errors.temperature?.message}>
        <UnitInput id="temperature" unit="°C" type="number" step="0.1" disabled={disabled} invalid={!!errors.temperature} {...register('temperature', numericFieldOptions)} />
      </FormField>
      <FormField label="Heart Rate (bpm)" htmlFor="heartrate" error={errors.heartrate?.message}>
        <UnitInput id="heartrate" unit="bpm" type="number" disabled={disabled} invalid={!!errors.heartrate} {...register('heartrate', numericFieldOptions)} />
      </FormField>
      <FormField label="Respiratory Rate (/min)" htmlFor="resprate" error={errors.resprate?.message}>
        <UnitInput id="resprate" unit="/min" type="number" disabled={disabled} invalid={!!errors.resprate} {...register('resprate', numericFieldOptions)} />
      </FormField>
      <FormField label="O2 Saturation (%)" htmlFor="o2sat" error={errors.o2sat?.message}>
        <UnitInput id="o2sat" unit="%" type="number" disabled={disabled} invalid={!!errors.o2sat} {...register('o2sat', numericFieldOptions)} />
      </FormField>

      <div className={sectionStyles.fullWidth}>
        <FormField label="Blood Pressure (mmHg)" htmlFor="sbp" error={errors.sbp?.message || errors.dbp?.message}>
          <BloodPressureInput
            sbpId="sbp"
            dbpId="dbp"
            sbpValue={sbpField.value ?? undefined}
            dbpValue={dbpField.value ?? undefined}
            onSbpChange={sbpField.onChange}
            onDbpChange={dbpField.onChange}
            disabled={disabled}
            sbpInvalid={!!errors.sbp}
            dbpInvalid={!!errors.dbp}
          />
        </FormField>
      </div>

      <div className={sectionStyles.fullWidth}>
        <FormField label="Pain" htmlFor="pain">
          <PainScaleSelector id="pain" value={painField.value} onChange={painField.onChange} disabled={disabled} />
        </FormField>
      </div>

      <FormField label="Blood Glucose (mg/dL)" htmlFor="isbar.blood_glucose">
        <UnitInput id="isbar.blood_glucose" unit="mg/dL" type="number" disabled={disabled} {...register('isbar.blood_glucose', numericFieldOptions)} />
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
        <UnitInput id="isbar.o2_flow_rate" unit="L/min" type="number" disabled={disabled} {...register('isbar.o2_flow_rate', numericFieldOptions)} />
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
