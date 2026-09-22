import { Check } from 'lucide-react'
import type { SectionId } from '../sectionFields'
import type { SectionStatus } from '../stepProgression'
import styles from './ISBARStepIndicator.module.css'

export interface StepIndicatorSection {
  id: SectionId
  title: string
  status: SectionStatus
}

interface ISBARStepIndicatorProps {
  sections: StepIndicatorSection[]
  currentId: SectionId | null
  onStepClick: (id: SectionId) => void
}

/** Compact 6-step progression above the accordion (ISBAR spec §7) — reinforces progress, never replaces the sections themselves. */
export function ISBARStepIndicator({ sections, currentId, onStepClick }: ISBARStepIndicatorProps) {
  return (
    <ol className={styles.steps} aria-label="ISBAR workflow progress">
      {sections.map((section, index) => {
        const isCurrent = section.id === currentId
        const isComplete = section.status === 'complete'
        const isMissing = section.status === 'missing-required'
        return (
          <li key={section.id}>
            <button
              type="button"
              className={[
                styles.step,
                isCurrent ? styles.current : '',
                isComplete ? styles.complete : '',
                isMissing ? styles.missing : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => onStepClick(section.id)}
              aria-current={isCurrent ? 'step' : undefined}
            >
              <span className={styles.marker} aria-hidden="true">
                {isComplete ? <Check size={13} /> : index + 1}
              </span>
              <span className={styles.label}>{section.title}</span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}
