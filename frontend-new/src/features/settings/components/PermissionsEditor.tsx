import { SECTION_PERMISSIONS, SETTINGS_TAB_PERMISSIONS, hasKey, toggleKey } from '../permissions'
import styles from './PermissionsEditor.module.css'

interface PermissionsEditorProps {
  sections: string
  settingsTabs: string
  onChange: (next: { sections: string; settingsTabs: string }) => void
  /** Admins get full access per backend semantics (§32) — checkboxes render checked and disabled rather than allowing a contradictory "Admin but no access" state. */
  isAdmin: boolean
}

/** Grouped checkboxes (§31), not a wall of tiny chips — real backend key vocabulary only (see permissions.ts's own compatibility note). */
export function PermissionsEditor({ sections, settingsTabs, onChange, isAdmin }: PermissionsEditorProps) {
  return (
    <div className={styles.editor}>
      <div className={styles.group}>
        <h4 className={styles.groupTitle}>Main Application</h4>
        <div className={styles.checkboxes}>
          {SECTION_PERMISSIONS.map((opt) => (
            <label key={opt.key} className={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={isAdmin || hasKey(sections, opt.key)}
                disabled={isAdmin}
                onChange={(e) => onChange({ sections: toggleKey(sections, opt.key, e.target.checked), settingsTabs })}
              />
              {opt.label}
            </label>
          ))}
        </div>
      </div>

      <div className={styles.group}>
        <h4 className={styles.groupTitle}>Settings Areas</h4>
        <div className={styles.checkboxes}>
          {SETTINGS_TAB_PERMISSIONS.map((opt) => (
            <label key={opt.key} className={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={isAdmin || hasKey(settingsTabs, opt.key)}
                disabled={isAdmin}
                onChange={(e) => onChange({ sections, settingsTabs: toggleKey(settingsTabs, opt.key, e.target.checked) })}
              />
              {opt.label}
            </label>
          ))}
        </div>
        <p className={styles.note}>
          Integrations and Accounts & Permissions have no separate backend permission yet — anyone with Settings access can
          currently reach them.
        </p>
      </div>

      {isAdmin && <p className={styles.note}>Admins have full access — permissions are not individually editable.</p>}
    </div>
  )
}
