import { forwardRef, type TextareaHTMLAttributes } from 'react'
import styles from './Controls.module.css'

interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean
}

// dir="auto" by default — see Input.tsx's own note; clinical free-text
// fields (reason for admission, diagnosis, lab notes, …) are exactly
// where Arabic content is most likely.
export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(({ invalid, className, dir = 'auto', ...rest }, ref) => (
  <textarea
    ref={ref}
    rows={3}
    dir={dir}
    className={[styles.control, styles.textarea, invalid ? styles.invalid : '', className].filter(Boolean).join(' ')}
    {...rest}
  />
))
TextArea.displayName = 'TextArea'
