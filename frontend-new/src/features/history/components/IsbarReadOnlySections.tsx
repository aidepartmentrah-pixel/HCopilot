import { useState } from 'react'
import { Accordion, AccordionItem } from '@/components/forms/Accordion'
import type { ISBARDetails } from '@/types/isbar'
import {
  backgroundFields,
  focusedAssessmentFields,
  recommendationFields,
  situationFields,
  vitalsFields,
} from '../isbarFields'
import { IsbarSectionBody } from './IsbarSectionBody'

const SECTIONS = [
  { id: 'vitals', title: 'Initial Vital Signs', fields: vitalsFields },
  { id: 'situation', title: 'Situation', fields: situationFields },
  { id: 'background', title: 'Background', fields: backgroundFields },
  { id: 'focused-assessment', title: 'Focused Assessment', fields: focusedAssessmentFields },
  { id: 'recommendation', title: 'Recommendation & Handover', fields: recommendationFields },
] as const

interface IsbarReadOnlySectionsProps {
  isbar: ISBARDetails | null | undefined
  /** compact = every section starts collapsed (preview pane); full = every section starts open (Full Record page). */
  defaultOpen: 'none' | 'all'
}

export function IsbarReadOnlySections({ isbar, defaultOpen }: IsbarReadOnlySectionsProps) {
  const [openSections, setOpenSections] = useState<Set<string>>(
    () => new Set(defaultOpen === 'all' ? SECTIONS.map((s) => s.id) : []),
  )

  return (
    <Accordion>
      {SECTIONS.map(({ id, title, fields }) => (
        <AccordionItem
          key={id}
          title={title}
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
          <IsbarSectionBody fields={fields(isbar)} />
        </AccordionItem>
      ))}
    </Accordion>
  )
}
