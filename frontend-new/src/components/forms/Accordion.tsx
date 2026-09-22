import { ChevronDown } from 'lucide-react'
import type { ReactNode } from 'react'
import styles from './Accordion.module.css'

interface AccordionItemProps {
  title: ReactNode
  badge?: ReactNode
  open: boolean
  onToggle: (open: boolean) => void
  children: ReactNode
  disabled?: boolean
  /** Stable test hook on the <summary> — Chromium reports <details> as role "group" with the
   *  summary text as its accessible *name*, not a separate role="button" child, so
   *  getByRole('button', {name}) can't target it; this is the reliable alternative. */
  testId?: string
}

/**
 * Built on native <details>/<summary> — keyboard/screen-reader behavior for
 * free, controlled from outside via `open`/`onToggle` so a page can drive
 * "all open" / "all closed" / one-at-a-time policies (§20).
 */
export function AccordionItem({ title, badge, open, onToggle, children, disabled, testId }: AccordionItemProps) {
  return (
    <details
      className={styles.item}
      open={open}
      onToggle={(e) => {
        if (disabled) return
        onToggle(e.currentTarget.open)
      }}
    >
      <summary
        data-testid={testId}
        className={[styles.summary, disabled ? styles.disabled : ''].filter(Boolean).join(' ')}
        onClick={(e) => {
          // Click (not toggle) is the cancelable event — stops native
          // toggling before it happens, rather than reverting it after.
          if (disabled) e.preventDefault()
        }}
      >
        <span className={styles.summaryTitle}>{title}</span>
        {badge}
        <ChevronDown className={styles.chevron} size={18} aria-hidden="true" />
      </summary>
      <div className={styles.body}>{children}</div>
    </details>
  )
}

export function Accordion({ children }: { children: ReactNode }) {
  return <div className={styles.accordion}>{children}</div>
}
