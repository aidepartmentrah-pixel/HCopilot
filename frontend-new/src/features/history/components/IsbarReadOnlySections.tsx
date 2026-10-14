import { useState } from 'react'
import { Accordion, AccordionItem } from '@/components/forms/Accordion'
import type { ISBARDetails } from '@/types/isbar'
import {
  backgroundFields,
  focusedAssessmentFields,
  recommendationFields,
  sectionRecordedStatus,
  situationFields,
  vitalsFields,
  type CoreVitals,
  type FieldSpec,
} from '../isbarFields'
import { IsbarSectionBody } from './IsbarSectionBody'
import { RecordedStatusBadge } from './RecordedStatusBadge'

type FieldsFn = (isbar: ISBARDetails | null | undefined, core?: CoreVitals) => FieldSpec[]

const SECTIONS: readonly { id: string; title: string; fields: FieldsFn }[] = [
  { id: 'vitals', title: 'Initial Vital Signs', fields: vitalsFields },
  { id: 'situation', title: 'Situation', fields: situationFields },
  { id: 'background', title: 'Background', fields: backgroundFields },
  { id: 'focused-assessment', title: 'Focused Assessment', fields: focusedAssessmentFields },
  { id: 'recommendation', title: 'Recommendation & Handover', fields: recommendationFields },
]

interface IsbarReadOnlySectionsProps {
  isbar: ISBARDetails | null | undefined
  /** The stay's own triage vitals (temperature, HR, …) shown in "Initial Vital Signs". */
  vitals?: CoreVitals
  /** compact = every section starts collapsed (preview pane); full = every section starts open (Full Record page). */
  defaultOpen: 'none' | 'all'
}

/** Patient & Arrival isn't repeated here as a 6th accordion — its fields (name/age/arrival/ESI/chief complaint) are already the PatientSummary header this sits below, so a duplicate section would just repeat it (History spec §25). */
export function IsbarReadOnlySections({ isbar, vitals, defaultOpen }: IsbarReadOnlySectionsProps) {
  const [openSections, setOpenSections] = useState<Set<string>>(
    () => new Set(defaultOpen === 'all' ? SECTIONS.map((s) => s.id) : []),
  )

  return (
    <Accordion>
      {SECTIONS.map(({ id, title, fields }) => {
        const fieldValues = fields(isbar, vitals)
        return (
          <AccordionItem
            key={id}
            title={title}
            badge={<RecordedStatusBadge status={sectionRecordedStatus(fieldValues)} />}
            testId={`history-section-${id}`}
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
            <IsbarSectionBody fields={fieldValues} />
          </AccordionItem>
        )
      })}
    </Accordion>
  )
}
