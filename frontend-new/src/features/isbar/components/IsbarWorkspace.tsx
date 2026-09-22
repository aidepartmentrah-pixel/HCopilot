import { FileText } from 'lucide-react'
import { useRef } from 'react'
import type { ReactElement } from 'react'
import type { UseFormReturn } from 'react-hook-form'
import { FormProvider } from 'react-hook-form'
import { Accordion, AccordionItem } from '@/components/forms/Accordion'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/feedback/EmptyState'
import type { IsbarFormValues } from '../schema'
import { SECTION_ORDER } from '../sectionFields'
import type { SectionId } from '../sectionFields'
import { useSectionStatuses } from '../useSectionStatuses'
import { BackgroundSection } from '../sections/BackgroundSection'
import { FocusedAssessmentSection } from '../sections/FocusedAssessmentSection'
import { PatientArrivalSection } from '../sections/PatientArrivalSection'
import { RecommendationSection } from '../sections/RecommendationSection'
import { SituationSection } from '../sections/SituationSection'
import { VitalSignsSection } from '../sections/VitalSignsSection'
import { ISBARStepIndicator } from './ISBARStepIndicator'
import { PatientIdentityBanner } from './PatientIdentityBanner'
import { SectionStatusBadge } from './SectionStatusBadge'
import styles from './IsbarWorkspace.module.css'

const SECTION_META: Record<SectionId, { title: string; Component: (props: { disabled: boolean }) => ReactElement }> = {
  'patient-arrival': { title: 'Patient & Arrival', Component: PatientArrivalSection },
  vitals: { title: 'Initial Vital Signs', Component: VitalSignsSection },
  situation: { title: 'Situation', Component: SituationSection },
  background: { title: 'Background', Component: BackgroundSection },
  'focused-assessment': { title: 'Focused Assessment', Component: FocusedAssessmentSection },
  recommendation: { title: 'Recommendation & Handover', Component: RecommendationSection },
}

interface IsbarWorkspaceProps {
  mode: 'disabled' | 'draft' | 'active'
  /** Changes whenever a different patient/draft loads — resets section progress. */
  resetKey: string | number
  methods: UseFormReturn<IsbarFormValues>
  onSubmit: (values: IsbarFormValues) => void
  onChangePatient: () => void
  isSaving: boolean
}

export function IsbarWorkspace({ mode, resetKey, methods, onSubmit, onChangePatient, isSaving }: IsbarWorkspaceProps) {
  const disabled = mode === 'disabled'
  const values = methods.watch()
  const { statuses, openSections, currentId, toggleSection, handleContinue, onWorkspaceBlur } = useSectionStatuses(methods, resetKey)
  const sectionRefs = useRef<Partial<Record<SectionId, HTMLDivElement | null>>>({})

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

  async function continueFrom(id: SectionId) {
    const nextId = await handleContinue(id)
    if (nextId) {
      // Let the next section actually open (state update) before scrolling to it.
      requestAnimationFrame(() => sectionRefs.current[nextId]?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    }
  }

  return (
    <div className={styles.panel}>
      {mode === 'active' && (
        <div className={styles.stickyBanner}>
          <PatientIdentityBanner
            name={values.name}
            age={values.age}
            gender={values.gender}
            arrivalTime={values.arrival_time}
            patientNumber={values.patient_id}
            acuity={values.acuity}
            onChangePatient={onChangePatient}
          />
        </div>
      )}

      <ISBARStepIndicator
        sections={SECTION_ORDER.map((id) => ({ id, title: SECTION_META[id].title, status: statuses[id] }))}
        currentId={currentId}
        onStepClick={(id) => toggleSection(id, true)}
      />

      <FormProvider {...methods}>
        <form onSubmit={methods.handleSubmit(onSubmit)} onBlur={onWorkspaceBlur}>
          <Accordion>
            {SECTION_ORDER.map((id, index) => {
              const { title, Component } = SECTION_META[id]
              const isLast = index === SECTION_ORDER.length - 1
              return (
                <div key={id} ref={(el) => { sectionRefs.current[id] = el }}>
                  <AccordionItem
                    title={
                      <span className={styles.stepTitle}>
                        <span className={styles.stepNumber}>{index + 1}</span>
                        {title}
                      </span>
                    }
                    badge={<SectionStatusBadge status={statuses[id]} />}
                    testId={`isbar-section-${id}`}
                    open={openSections.has(id)}
                    onToggle={(open) => toggleSection(id, open)}
                  >
                    <Component disabled={disabled} />
                    {!isLast && (
                      <div className={styles.continueRow}>
                        <Button type="button" onClick={() => continueFrom(id)} data-testid={`isbar-continue-${id}`}>
                          Continue to {SECTION_META[SECTION_ORDER[index + 1]].title} →
                        </Button>
                      </div>
                    )}
                  </AccordionItem>
                </div>
              )
            })}
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
      {SECTION_ORDER.map((id, i) => (
        <div key={id} className={styles.previewRow}>
          <span className={styles.previewBadge}>{i + 1}</span>
          {SECTION_META[id].title}
        </div>
      ))}
    </div>
  )
}
