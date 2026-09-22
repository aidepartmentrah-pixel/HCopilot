import { AlertOctagon } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { FormField } from '@/components/forms/FormField'
import { Input } from '@/components/forms/Input'
import { useToast } from '@/components/feedback/useToast'
import { resetApi } from '@/api/settings'
import styles from './DangerZone.module.css'

const CONFIRM_PHRASE = 'RESET EVERYTHING'

/**
 * Restrained until the user is actually inside Reset — no permanent
 * warning banner elsewhere in the app (§24) — then a real type-to-confirm
 * gate, not just an "Are you sure?" dialog, since this wipes all data.
 */
export function DangerZone() {
  const [confirmText, setConfirmText] = useState('')
  const [isResetting, setIsResetting] = useState(false)
  const { showToast } = useToast()

  const canReset = confirmText === CONFIRM_PHRASE

  async function handleReset() {
    setIsResetting(true)
    try {
      await resetApi.all()
      showToast('All data has been reset.', 'success')
      setConfirmText('')
    } catch {
      showToast('Reset failed. No changes may have been made — check with an administrator.', 'error')
    } finally {
      setIsResetting(false)
    }
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <AlertOctagon size={22} className={styles.icon} aria-hidden="true" />
        <div>
          <h2 className={styles.title}>Reset All Data</h2>
          <p className={styles.description}>
            Permanently deletes every patient, bed assignment, and staff record in this HCopilot instance. This cannot be
            undone. Use only for demo/test resets, never on a live hospital deployment.
          </p>
        </div>
      </div>

      <FormField
        label={`Type "${CONFIRM_PHRASE}" to confirm`}
        htmlFor="reset-confirm"
        hint="This is the only thing that unlocks the button below."
      >
        <Input
          id="reset-confirm"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          autoComplete="off"
        />
      </FormField>

      <Button variant="destructive" disabled={!canReset} loading={isResetting} onClick={handleReset}>
        Reset Everything
      </Button>
    </div>
  )
}
