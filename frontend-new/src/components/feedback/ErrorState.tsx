import { AlertTriangle } from 'lucide-react'
import styles from './States.module.css'
import { Button } from '../ui/Button'

interface ErrorStateProps {
  title?: string
  description: string
  onRetry?: () => void
}

/** Explains what failed and what the user can do (§17) — never a bare blank area. */
export function ErrorState({ title = 'Something went wrong', description, onRetry }: ErrorStateProps) {
  return (
    <div className={styles.state} role="alert">
      <div className={styles.iconDanger} aria-hidden="true">
        <AlertTriangle size={22} />
      </div>
      <p className={styles.title}>{title}</p>
      <p className={styles.description}>{description}</p>
      {onRetry && (
        <div className={styles.action}>
          <Button variant="secondary" size="sm" onClick={onRetry}>
            Try Again
          </Button>
        </div>
      )}
    </div>
  )
}
