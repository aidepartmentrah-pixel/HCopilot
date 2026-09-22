import { AlertTriangle } from 'lucide-react'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { useAuth } from '@/app/providers/useAuth'
import { ApiError } from '@/api/client'
import { HCopilotMark } from '@/components/brand/HCopilotMark'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { FormField } from '@/components/forms/FormField'
import { Input } from '@/components/forms/Input'
import styles from './LoginPage.module.css'

function extractErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    try {
      const parsed = JSON.parse(err.message) as { detail?: string }
      if (typeof parsed.detail === 'string') return parsed.detail
    } catch {
      // body wasn't JSON — fall through to the raw message below
    }
    return err.message || 'Sign in failed.'
  }
  return 'Sign in failed. Check your connection and try again.'
}

/**
 * There is no login screen in frontend-new today (§13/Dashboard spec —
 * "use authenticated session data" presumes a session exists). Adding one
 * is the only honest way to show a real user identity instead of a
 * hardcoded placeholder; the backend already fully supports it
 * (auth/api.py's /login, unchanged here). See V2.0's log entry for the
 * scope reasoning.
 */
export function LoginPage() {
  const { login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await login(username, password)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={styles.page}>
      <Card className={styles.card}>
        <div className={styles.brand}>
          <HCopilotMark size={44} />
          <div>
            <div className={styles.wordmark}>HCopilot</div>
            <div className={styles.tagline}>Smarter ER Care. Together.</div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <FormField label="Username" htmlFor="login-username">
            <Input
              id="login-username"
              name="username"
              autoComplete="username"
              dir="auto"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoFocus
            />
          </FormField>
          <FormField label="Password" htmlFor="login-password">
            <Input
              id="login-password"
              name="password"
              type="password"
              autoComplete="current-password"
              dir="ltr"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </FormField>

          {error && (
            <div className={styles.error} role="alert">
              <AlertTriangle size={16} aria-hidden="true" />
              {error}
            </div>
          )}

          <Button type="submit" loading={submitting} className={styles.submit}>
            Sign In
          </Button>
        </form>
      </Card>
    </div>
  )
}
