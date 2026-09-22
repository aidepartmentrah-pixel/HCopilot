import type { FieldSpec } from '../isbarFields'
import { humanizeList } from '../isbarFields'
import styles from '../IsbarReadOnly.module.css'

/** Renders only the fields that were actually recorded — an unrecorded ISBAR field is absent, never shown as blank/zero (mirrors the Statistics page's own "documented cohort" framing). */
export function IsbarSectionBody({ fields }: { fields: FieldSpec[] }) {
  const populated = fields.filter((f) => f.value)
  if (populated.length === 0) {
    return <p className={styles.empty}>Nothing recorded for this section.</p>
  }
  return (
    <dl className={styles.grid}>
      {populated.map((f) => (
        <div key={f.label} className={styles.row}>
          <dt className={styles.label}>{f.label}</dt>
          <dd className={styles.value} dir="auto">
            {f.multi ? humanizeList(f.value) : f.value}
          </dd>
        </div>
      ))}
    </dl>
  )
}
