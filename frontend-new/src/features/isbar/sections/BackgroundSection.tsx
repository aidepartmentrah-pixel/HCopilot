import { Controller, useFormContext } from 'react-hook-form'
import { FormField } from '@/components/forms/FormField'
import { Input } from '@/components/forms/Input'
import { MultiSelectChips } from '@/components/forms/MultiSelectChips'
import { Select } from '@/components/forms/Select'
import { TextArea } from '@/components/forms/TextArea'
import { YesNoToggle } from '@/components/forms/YesNoToggle'
import {
  ALLERGIES_STATUS_OPTIONS,
  ALLERGY_TYPES_OPTIONS,
  HIGH_ALERT_MEDS_OPTIONS,
  ISOLATION_OPTIONS,
  PAST_MEDICAL_HISTORY_OPTIONS,
  RECENT_PROCEDURES_OPTIONS,
} from '@/types/isbar'
import type { IsbarFormValues } from '../schema'
import sectionStyles from './Section.module.css'

export function BackgroundSection({ disabled }: { disabled: boolean }) {
  const { register, control, watch } = useFormContext<IsbarFormValues>()
  const pastHistory = watch('isbar.past_medical_history') ?? ''
  const surgicalFlag = watch('isbar.surgical_history_flag')
  const allergiesStatus = watch('isbar.allergies_status')
  const recentProcedures = watch('isbar.recent_procedures') ?? ''

  return (
    <div className={sectionStyles.grid}>
      <div className={sectionStyles.fullWidth}>
        <FormField label="Past Medical History" htmlFor="isbar.past_medical_history">
          <Controller
            name="isbar.past_medical_history"
            control={control}
            render={({ field }) => (
              <MultiSelectChips
                id="isbar.past_medical_history"
                value={field.value}
                onChange={field.onChange}
                options={PAST_MEDICAL_HISTORY_OPTIONS}
                disabled={disabled}
              />
            )}
          />
        </FormField>
      </div>
      {pastHistory.split(',').includes('other') && (
        <div className={sectionStyles.fullWidth}>
          <FormField label="Other Past Medical History" htmlFor="isbar.past_medical_history_other">
            <Input id="isbar.past_medical_history_other" disabled={disabled} {...register('isbar.past_medical_history_other')} />
          </FormField>
        </div>
      )}

      <FormField label="Surgical History" htmlFor="isbar.surgical_history_flag">
        <Controller
          name="isbar.surgical_history_flag"
          control={control}
          render={({ field }) => (
            <YesNoToggle id="isbar.surgical_history_flag" value={field.value} onChange={field.onChange} disabled={disabled} />
          )}
        />
      </FormField>
      {surgicalFlag === 'Yes' && (
        <div className={sectionStyles.fullWidth}>
          <FormField label="Surgical History Details" htmlFor="isbar.surgical_history_text">
            <TextArea id="isbar.surgical_history_text" disabled={disabled} {...register('isbar.surgical_history_text')} />
          </FormField>
        </div>
      )}

      <FormField label="Allergies" htmlFor="isbar.allergies_status">
        <Select id="isbar.allergies_status" disabled={disabled} placeholder="Select…" {...register('isbar.allergies_status')}>
          {ALLERGIES_STATUS_OPTIONS.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </Select>
      </FormField>
      {allergiesStatus === 'Yes' && (
        <>
          <FormField label="Allergy Types" htmlFor="isbar.allergy_types">
            <Controller
              name="isbar.allergy_types"
              control={control}
              render={({ field }) => (
                <MultiSelectChips
                  id="isbar.allergy_types"
                  value={field.value}
                  onChange={field.onChange}
                  options={ALLERGY_TYPES_OPTIONS}
                  disabled={disabled}
                />
              )}
            />
          </FormField>
          <FormField label="Allergy Substance" htmlFor="isbar.allergy_substance">
            <Input id="isbar.allergy_substance" disabled={disabled} {...register('isbar.allergy_substance')} />
          </FormField>
          <FormField label="Allergy Reaction" htmlFor="isbar.allergy_reaction">
            <Input id="isbar.allergy_reaction" disabled={disabled} {...register('isbar.allergy_reaction')} />
          </FormField>
        </>
      )}

      <FormField label="Isolation Precautions" htmlFor="isbar.isolation_precautions">
        <Select id="isbar.isolation_precautions" disabled={disabled} placeholder="Select…" {...register('isbar.isolation_precautions')}>
          {ISOLATION_OPTIONS.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </Select>
      </FormField>

      <div className={sectionStyles.fullWidth}>
        <FormField label="High-Alert Medications" htmlFor="isbar.high_alert_meds">
          <Controller
            name="isbar.high_alert_meds"
            control={control}
            render={({ field }) => (
              <MultiSelectChips
                id="isbar.high_alert_meds"
                value={field.value}
                onChange={field.onChange}
                options={HIGH_ALERT_MEDS_OPTIONS}
                disabled={disabled}
              />
            )}
          />
        </FormField>
      </div>

      <div className={sectionStyles.fullWidth}>
        <FormField label="Recent Procedures" htmlFor="isbar.recent_procedures">
          <Controller
            name="isbar.recent_procedures"
            control={control}
            render={({ field }) => (
              <MultiSelectChips
                id="isbar.recent_procedures"
                value={field.value}
                onChange={field.onChange}
                options={RECENT_PROCEDURES_OPTIONS}
                disabled={disabled}
              />
            )}
          />
        </FormField>
      </div>
      {recentProcedures.length > 0 && (
        <FormField label="Recent Procedure Date/Time" htmlFor="isbar.recent_procedure_datetime">
          <Input
            id="isbar.recent_procedure_datetime"
            type="datetime-local"
            disabled={disabled}
            {...register('isbar.recent_procedure_datetime')}
          />
        </FormField>
      )}
    </div>
  )
}
