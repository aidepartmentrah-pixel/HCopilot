import { Info } from 'lucide-react'
import styles from './DocumentationCoverageBanner.module.css'

/** Compact page-level version of the mandatory documentation-coverage disclosure (§22) — was a per-panel paragraph, now one banner for the whole page. */
export function DocumentationCoverageBanner() {
  return (
    <div className={styles.banner} role="note">
      <Info size={16} aria-hidden="true" />
      <span>
        <strong>Documentation coverage —</strong> metrics include only stays where the relevant field was recorded. Undocumented
        fields are excluded and are not counted as negative.
      </span>
    </div>
  )
}
