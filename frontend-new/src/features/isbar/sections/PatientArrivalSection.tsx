import { useController, useFormContext } from 'react-hook-form'
import { FormDateTimeInput } from '@/components/forms/DateTimeInput'
import { FormField } from '@/components/forms/FormField'
import { Input } from '@/components/forms/Input'
import { Select } from '@/components/forms/Select'
import { GENDER_OPTIONS, numericFieldOptions } from '../constants'
import { ESIScaleSelector } from '../components/ESIScaleSelector'
import type { IsbarFormValues } from '../schema'
import sectionStyles from './Section.module.css'

export function PatientArrivalSection({ disabled }: { disabled: boolean }) {
  const {
    register,
    control,
    formState: { errors },
  } = useFormContext<IsbarFormValues>()
  const acuityField = useController({ name: 'acuity', control }).field

  return (
    <div className={sectionStyles.grid}>
      <FormField label="Patient ID (MRN)" htmlFor="patient_id">
        <Input id="patient_id" readOnly disabled {...register('patient_id', { valueAsNumber: true })} />
      </FormField>
      <FormField label="Stay ID (Visit #)" htmlFor="stay_id">
        <Input id="stay_id" readOnly disabled {...register('stay_id', { valueAsNumber: true })} />
      </FormField>
      <FormField label="Full Name" htmlFor="name" required error={errors.name?.message}>
        <Input id="name" dir="auto" disabled={disabled} invalid={!!errors.name} {...register('name')} />
      </FormField>
      <FormField label="Gender" htmlFor="gender" required error={errors.gender?.message}>
        <Select id="gender" disabled={disabled} invalid={!!errors.gender} placeholder="Select…" {...register('gender')}>
          {GENDER_OPTIONS.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </Select>
      </FormField>
      <FormField label="Age" htmlFor="age" required error={errors.age?.message}>
        <Input id="age" type="number" min={0} disabled={disabled} invalid={!!errors.age} {...register('age', numericFieldOptions)} />
      </FormField>
      <FormField label="Arrival Time" htmlFor="arrival_time" required error={errors.arrival_time?.message}>
        <FormDateTimeInput<IsbarFormValues>
          name="arrival_time"
          id="arrival_time"
          disabled={disabled}
          invalid={!!errors.arrival_time}
          maxNow
        />
      </FormField>
      <FormField label="Triage Time" htmlFor="triage_time" hint="Optional — when a doctor first saw the patient">
        <FormDateTimeInput<IsbarFormValues> name="triage_time" id="triage_time" disabled={disabled} maxNow />
      </FormField>
      <FormField
        label="Chief Complaint (Triage)"
        htmlFor="chiefcomplaint"
        required
        error={errors.chiefcomplaint?.message}
      >
        <Input id="chiefcomplaint" dir="auto" disabled={disabled} invalid={!!errors.chiefcomplaint} {...register('chiefcomplaint')} />
      </FormField>
      <div className={sectionStyles.fullWidth}>
        <FormField label="Acuity (ESI)" htmlFor="acuity" required error={errors.acuity?.message}>
          <ESIScaleSelector
            id="acuity"
            value={acuityField.value}
            onChange={acuityField.onChange}
            disabled={disabled}
            invalid={!!errors.acuity}
          />
        </FormField>
      </div>
    </div>
  )
}
