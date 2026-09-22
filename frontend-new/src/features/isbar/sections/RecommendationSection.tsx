import { Controller, useFormContext } from 'react-hook-form'
import { FormField } from '@/components/forms/FormField'
import { Input } from '@/components/forms/Input'
import { MultiSelectChips } from '@/components/forms/MultiSelectChips'
import { TextArea } from '@/components/forms/TextArea'
import { TileSingleSelect } from '@/components/forms/TileSingleSelect'
import { DISCHARGE_PLAN_OPTIONS, NURSING_PRIORITIES_OPTIONS, OUTSTANDING_TASKS_OPTIONS } from '@/types/isbar'
import type { IsbarFormValues } from '../schema'
import sectionStyles from './Section.module.css'

export function RecommendationSection({ disabled }: { disabled: boolean }) {
  const { register, control, watch } = useFormContext<IsbarFormValues>()
  const nursingPriorities = watch('isbar.nursing_priorities') ?? ''
  const dischargePlan = watch('isbar.discharge_transfer_plan')
  const outstandingTasks = watch('isbar.outstanding_tasks') ?? ''

  return (
    <div className={sectionStyles.grid}>
      <div className={sectionStyles.fullWidth}>
        <FormField label="Nursing Priorities" htmlFor="isbar.nursing_priorities">
          <Controller
            name="isbar.nursing_priorities"
            control={control}
            render={({ field }) => (
              <MultiSelectChips
                id="isbar.nursing_priorities"
                value={field.value}
                onChange={field.onChange}
                options={NURSING_PRIORITIES_OPTIONS}
                disabled={disabled}
              />
            )}
          />
        </FormField>
      </div>
      {nursingPriorities.split(',').includes('other') && (
        <div className={sectionStyles.fullWidth}>
          <FormField label="Other Nursing Priority" htmlFor="isbar.nursing_priorities_other">
            <Input id="isbar.nursing_priorities_other" disabled={disabled} {...register('isbar.nursing_priorities_other')} />
          </FormField>
        </div>
      )}

      <div className={sectionStyles.fullWidth}>
        <FormField label="Medications Due Next Shift" htmlFor="isbar.meds_due_next_shift">
          <TextArea id="isbar.meds_due_next_shift" disabled={disabled} {...register('isbar.meds_due_next_shift')} />
        </FormField>
      </div>
      <div className={sectionStyles.fullWidth}>
        <FormField label="Pending Medical Review" htmlFor="isbar.pending_medical_review">
          <TextArea id="isbar.pending_medical_review" disabled={disabled} {...register('isbar.pending_medical_review')} />
        </FormField>
      </div>
      <div className={sectionStyles.fullWidth}>
        <FormField label="Consultations" htmlFor="isbar.consultations">
          <TextArea id="isbar.consultations" disabled={disabled} {...register('isbar.consultations')} />
        </FormField>
      </div>

      <div className={sectionStyles.fullWidth}>
        <FormField label="Discharge / Transfer Plan" htmlFor="isbar.discharge_transfer_plan">
          <Controller
            name="isbar.discharge_transfer_plan"
            control={control}
            render={({ field }) => (
              <TileSingleSelect
                id="isbar.discharge_transfer_plan"
                value={field.value}
                onChange={field.onChange}
                options={DISCHARGE_PLAN_OPTIONS}
                disabled={disabled}
              />
            )}
          />
        </FormField>
      </div>
      {dischargePlan === 'other' && (
        <FormField label="Other Discharge/Transfer Plan" htmlFor="isbar.discharge_transfer_plan_other">
          <Input id="isbar.discharge_transfer_plan_other" disabled={disabled} {...register('isbar.discharge_transfer_plan_other')} />
        </FormField>
      )}

      <div className={sectionStyles.fullWidth}>
        <FormField label="Outstanding Tasks" htmlFor="isbar.outstanding_tasks">
          <Controller
            name="isbar.outstanding_tasks"
            control={control}
            render={({ field }) => (
              <MultiSelectChips
                id="isbar.outstanding_tasks"
                value={field.value}
                onChange={field.onChange}
                options={OUTSTANDING_TASKS_OPTIONS}
                disabled={disabled}
              />
            )}
          />
        </FormField>
      </div>
      {outstandingTasks.split(',').includes('other') && (
        <div className={sectionStyles.fullWidth}>
          <FormField label="Other Outstanding Task" htmlFor="isbar.outstanding_tasks_other">
            <Input id="isbar.outstanding_tasks_other" disabled={disabled} {...register('isbar.outstanding_tasks_other')} />
          </FormField>
        </div>
      )}

      <FormField label="Outgoing Nurse" htmlFor="isbar.outgoing_nurse">
        <Input id="isbar.outgoing_nurse" disabled={disabled} {...register('isbar.outgoing_nurse')} />
      </FormField>
      <FormField label="Incoming Nurse" htmlFor="isbar.incoming_nurse">
        <Input id="isbar.incoming_nurse" disabled={disabled} {...register('isbar.incoming_nurse')} />
      </FormField>
      <FormField label="Handover Date/Time" htmlFor="isbar.handover_datetime">
        <Input id="isbar.handover_datetime" type="datetime-local" disabled={disabled} {...register('isbar.handover_datetime')} />
      </FormField>
      <FormField label="Receiver Acknowledged" htmlFor="isbar.receiver_ack">
        <label className={sectionStyles.checkboxLabel}>
          <input type="checkbox" id="isbar.receiver_ack" disabled={disabled} {...register('isbar.receiver_ack')} />
          Handover acknowledged by receiving nurse
        </label>
      </FormField>
    </div>
  )
}
