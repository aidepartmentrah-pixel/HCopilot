import { Controller, useFormContext } from 'react-hook-form'
import { FormField } from '@/components/forms/FormField'
import { MultiSelectChips } from '@/components/forms/MultiSelectChips'
import { Select } from '@/components/forms/Select'
import { TextArea } from '@/components/forms/TextArea'
import { CLINICAL_STATUS_OPTIONS, IMMEDIATE_CONCERNS_OPTIONS } from '@/types/isbar'
import type { IsbarFormValues } from '../schema'
import sectionStyles from './Section.module.css'

export function SituationSection({ disabled }: { disabled: boolean }) {
  const { register, control, watch } = useFormContext<IsbarFormValues>()
  const showOtherConcern = (watch('isbar.immediate_concerns') ?? '').split(',').includes('other')

  return (
    <div className={sectionStyles.grid}>
      <div className={sectionStyles.fullWidth}>
        <FormField label="Reason for Admission" htmlFor="isbar.reason_for_admission">
          <TextArea id="isbar.reason_for_admission" disabled={disabled} {...register('isbar.reason_for_admission')} />
        </FormField>
      </div>
      <div className={sectionStyles.fullWidth}>
        <FormField label="Current Diagnosis" htmlFor="isbar.current_diagnosis">
          <TextArea id="isbar.current_diagnosis" disabled={disabled} {...register('isbar.current_diagnosis')} />
        </FormField>
      </div>
      <FormField label="Clinical Status" htmlFor="isbar.clinical_status">
        <Select id="isbar.clinical_status" disabled={disabled} placeholder="Select…" {...register('isbar.clinical_status')}>
          {CLINICAL_STATUS_OPTIONS.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </Select>
      </FormField>
      <div className={sectionStyles.fullWidth}>
        <FormField label="Immediate Concerns" htmlFor="isbar.immediate_concerns">
          <Controller
            name="isbar.immediate_concerns"
            control={control}
            render={({ field }) => (
              <MultiSelectChips
                id="isbar.immediate_concerns"
                value={field.value}
                onChange={field.onChange}
                options={IMMEDIATE_CONCERNS_OPTIONS}
                disabled={disabled}
              />
            )}
          />
        </FormField>
      </div>
      {showOtherConcern && (
        <div className={sectionStyles.fullWidth}>
          <FormField label="Other Immediate Concern" htmlFor="isbar.immediate_concerns_other">
            <TextArea id="isbar.immediate_concerns_other" disabled={disabled} {...register('isbar.immediate_concerns_other')} />
          </FormField>
        </div>
      )}
    </div>
  )
}
