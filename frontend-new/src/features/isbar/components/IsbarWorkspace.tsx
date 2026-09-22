import { FileText } from 'lucide-react'
import { useState } from 'react'
import type { UseFormReturn } from 'react-hook-form'
import { FormProvider } from 'react-hook-form'
import { Accordion, AccordionItem } from '@/components/forms/Accordion'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/feedback/EmptyState'
import type { IsbarFormValues } from '../schema'
import { BackgroundSection } from '../sections/BackgroundSection'
import { FocusedAssessmentSection } from '../sections/FocusedAssessmentSection'
import { PatientArrivalSection } from '../sections/PatientArrivalSection'
import { RecommendationSection } from '../sections/RecommendationSection'
import { SituationSection } from '../sections/SituationSection'
import { VitalSignsSection } from '../sections/VitalSignsSection'
import { PatientIdentityBanner } from './PatientIdentityBanner'
import styles from './IsbarWorkspace.module.css'

const SECTIONS = [
  { id: 'patient-arrival', title: 'Patient & Arrival', Component: PatientArrivalSection },
  { id: 'vitals', title: 'Initial Vital Signs', Component: VitalSignsSection },
  { id: 'situation', title: 'Situation', Component: SituationSection },
  { id: 'background', title: 'Background', Component: BackgroundSection },
  { id: 'focused-assessment', title: 'Focused Assessment', Component: FocusedAssessmentSection },
  { id: 'recommendation', title: 'Recommendation & Handover', Component: RecommendationSection },
] as const

interface IsbarWorkspaceProps {
  mode: 'disabled' | 'draft' | 'active'
  methods: UseFormReturn<IsbarFormValues>
  onSubmit: (values: IsbarFormValues) => void
  onChangePatient: () => void
  isSaving: boolean
}

export function IsbarWorkspace({ mode, methods, onSubmit, onChangePatient, isSaving }: IsbarWorkspaceProps) {
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(['patient-arrival']))
  const disabled = mode === 'disabled'
  const values = methods.watch()

  if (mode === 'disabled') {
    return (
      <div className={styles.panel}>
        <EmptyState
          icon={<FileText size={28} />}
          title="No patient selected"
          description="Select a patient from the Live ER Roster to begin ISBAR entry. The patient's information will load automatically, and you can then complete the ISBAR sections."
        />
        <AccordionPreview />
      </div>
    )
  }

  return (
    <div className={styles.panel}>
      {mode === 'active' && (
        <PatientIdentityBanner
          name={values.name}
          age={values.age}
          gender={values.gender}
          arrivalTime={values.arrival_time}
          patientNumber={values.patient_id}
          acuity={values.acuity}
          onChangePatient={onChangePatient}
        />
      )}
      <FormProvider {...methods}>
        <form onSubmit={methods.handleSubmit(onSubmit)}>
          <Accordion>
            {SECTIONS.map(({ id, title, Component }) => (
              <AccordionItem
                key={id}
                title={title}
                testId={`isbar-section-${id}`}
                open={openSections.has(id)}
                onToggle={(open) =>
                  setOpenSections((current) => {
                    const next = new Set(current)
                    if (open) next.add(id)
                    else next.delete(id)
                    return next
                  })
                }
              >
                <Component disabled={disabled} />
              </AccordionItem>
            ))}
          </Accordion>

          <div className={styles.footer}>
            <Button type="submit" loading={isSaving}>
              {mode === 'draft' ? 'Start ISBAR' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </FormProvider>
    </div>
  )
}

/** A faint hint of the section structure behind the empty state, matching the locked-form mockup reference. */
function AccordionPreview() {
  return (
    <div className={styles.preview} aria-hidden="true">
      {SECTIONS.map((s, i) => (
        <div key={s.id} className={styles.previewRow}>
          <span className={styles.previewBadge}>{i + 1}</span>
          {s.title}
        </div>
      ))}
    </div>
  )
}
