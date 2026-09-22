import { Controller, useFormContext } from 'react-hook-form'
import { FormField } from '@/components/forms/FormField'
import { Input } from '@/components/forms/Input'
import { MultiSelectChips } from '@/components/forms/MultiSelectChips'
import { TextArea } from '@/components/forms/TextArea'
import { TileSingleSelect } from '@/components/forms/TileSingleSelect'
import { YesNoToggle } from '@/components/forms/YesNoToggle'
import { LINES_TUBES_OPTIONS, NEURO_STATUS_OPTIONS, SWALLOW_OPTIONS, VOIDING_OPTIONS } from '@/types/isbar'
import { numericFieldOptions } from '../constants'
import type { IsbarFormValues } from '../schema'
import sectionStyles from './Section.module.css'

const YES_NO_FIELDS = [
  ['telemetry', 'Telemetry'],
  ['edema', 'Edema'],
  ['peripheral_pulses', 'Peripheral Pulses Normal'],
  ['npo', 'NPO'],
  ['urinary_catheter', 'Urinary Catheter'],
  ['wounds', 'Wounds'],
  ['fall_risk', 'Fall Risk'],
  ['pressure_injury_risk', 'Pressure Injury Risk'],
  ['mobility_aids', 'Mobility Aids'],
] as const

export function FocusedAssessmentSection({ disabled }: { disabled: boolean }) {
  const { register, control } = useFormContext<IsbarFormValues>()

  return (
    <div className={sectionStyles.grid}>
      <div className={sectionStyles.fullWidth}>
        <FormField label="Neuro Status" htmlFor="isbar.neuro_status">
          <Controller
            name="isbar.neuro_status"
            control={control}
            render={({ field }) => (
              <TileSingleSelect id="isbar.neuro_status" value={field.value} onChange={field.onChange} options={NEURO_STATUS_OPTIONS} disabled={disabled} />
            )}
          />
        </FormField>
      </div>

      {YES_NO_FIELDS.map(([field, label]) => (
        <FormField key={field} label={label} htmlFor={`isbar.${field}`}>
          <Controller
            name={`isbar.${field}`}
            control={control}
            render={({ field: f }) => (
              <YesNoToggle id={`isbar.${field}`} value={f.value} onChange={f.onChange} disabled={disabled} />
            )}
          />
        </FormField>
      ))}

      <FormField label="Diet" htmlFor="isbar.diet">
        <Input id="isbar.diet" disabled={disabled} {...register('isbar.diet')} />
      </FormField>
      <div className={sectionStyles.fullWidth}>
        <FormField label="Swallow Assessment" htmlFor="isbar.swallow_assessment">
          <Controller
            name="isbar.swallow_assessment"
            control={control}
            render={({ field }) => (
              <TileSingleSelect id="isbar.swallow_assessment" value={field.value} onChange={field.onChange} options={SWALLOW_OPTIONS} disabled={disabled} />
            )}
          />
        </FormField>
      </div>
      <FormField label="Last Bowel Movement" htmlFor="isbar.last_bowel_movement">
        <Input id="isbar.last_bowel_movement" type="datetime-local" disabled={disabled} {...register('isbar.last_bowel_movement')} />
      </FormField>
      <div className={sectionStyles.fullWidth}>
        <FormField label="Voiding" htmlFor="isbar.voiding">
          <Controller
            name="isbar.voiding"
            control={control}
            render={({ field }) => (
              <TileSingleSelect id="isbar.voiding" value={field.value} onChange={field.onChange} options={VOIDING_OPTIONS} disabled={disabled} />
            )}
          />
        </FormField>
      </div>
      <FormField label="Intake (mL)" htmlFor="isbar.intake_ml">
        <Input id="isbar.intake_ml" type="number" disabled={disabled} {...register('isbar.intake_ml', numericFieldOptions)} />
      </FormField>
      <FormField label="Output (mL)" htmlFor="isbar.output_ml">
        <Input id="isbar.output_ml" type="number" disabled={disabled} {...register('isbar.output_ml', numericFieldOptions)} />
      </FormField>

      <div className={sectionStyles.fullWidth}>
        <FormField label="Lines / Tubes / Drains" htmlFor="isbar.lines_tubes_drains">
          <Controller
            name="isbar.lines_tubes_drains"
            control={control}
            render={({ field }) => (
              <MultiSelectChips
                id="isbar.lines_tubes_drains"
                value={field.value}
                onChange={field.onChange}
                options={LINES_TUBES_OPTIONS}
                disabled={disabled}
              />
            )}
          />
        </FormField>
      </div>

      <div className={sectionStyles.fullWidth}>
        <FormField label="Critical Lab Results" htmlFor="isbar.critical_lab_results">
          <TextArea id="isbar.critical_lab_results" disabled={disabled} {...register('isbar.critical_lab_results')} />
        </FormField>
      </div>
      <div className={sectionStyles.fullWidth}>
        <FormField label="Pending Labs" htmlFor="isbar.pending_labs">
          <TextArea id="isbar.pending_labs" disabled={disabled} {...register('isbar.pending_labs')} />
        </FormField>
      </div>
      <div className={sectionStyles.fullWidth}>
        <FormField label="Pending Imaging" htmlFor="isbar.pending_imaging">
          <TextArea id="isbar.pending_imaging" disabled={disabled} {...register('isbar.pending_imaging')} />
        </FormField>
      </div>
    </div>
  )
}
