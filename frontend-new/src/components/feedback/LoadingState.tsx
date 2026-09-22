import { Loader2 } from 'lucide-react'
import styles from './States.module.css'

interface LoadingStateProps {
  label?: string
}

export function LoadingState({ label = 'Loading…' }: LoadingStateProps) {
  return (
    <div className={styles.state} role="status" aria-live="polite">
      <Loader2 className={styles.spinner} size={24} aria-hidden="true" />
      <p className={styles.description}>{label}</p>
    </div>
  )
}
