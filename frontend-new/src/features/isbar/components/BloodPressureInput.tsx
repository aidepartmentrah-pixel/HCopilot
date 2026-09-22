import styles from './BloodPressureInput.module.css'

interface BloodPressureInputProps {
  sbpId: string
  dbpId: string
  sbpValue: number | undefined
  dbpValue: number | undefined
  onSbpChange: (value: number | undefined) => void
  onDbpChange: (value: number | undefined) => void
  disabled?: boolean
  sbpInvalid?: boolean
  dbpInvalid?: boolean
}

function toNumberOrUndefined(raw: string): number | undefined {
  return raw === '' ? undefined : Number(raw)
}

/** SBP/DBP as one clinical concept (ISBAR spec §16) — stored as two separate schema fields, never merged into one. */
export function BloodPressureInput({
  sbpId,
  dbpId,
  sbpValue,
  dbpValue,
  onSbpChange,
  onDbpChange,
  disabled,
  sbpInvalid,
  dbpInvalid,
}: BloodPressureInputProps) {
  return (
    <div className={styles.wrapper}>
      <input
        id={sbpId}
        type="number"
        aria-label="Systolic BP (mmHg)"
        placeholder="SBP"
        disabled={disabled}
        value={sbpValue ?? ''}
        onChange={(e) => onSbpChange(toNumberOrUndefined(e.target.value))}
        className={[styles.field, sbpInvalid ? styles.invalid : ''].filter(Boolean).join(' ')}
      />
      <span className={styles.slash} aria-hidden="true">
        /
      </span>
      <input
        id={dbpId}
        type="number"
        aria-label="Diastolic BP (mmHg)"
        placeholder="DBP"
        disabled={disabled}
        value={dbpValue ?? ''}
        onChange={(e) => onDbpChange(toNumberOrUndefined(e.target.value))}
        className={[styles.field, dbpInvalid ? styles.invalid : ''].filter(Boolean).join(' ')}
      />
      <span className={styles.unit} aria-hidden="true">
        mmHg
      </span>
    </div>
  )
}
