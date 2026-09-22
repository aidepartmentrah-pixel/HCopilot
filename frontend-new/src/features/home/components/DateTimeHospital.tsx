import { format } from 'date-fns'
import { useEffect, useState } from 'react'
import styles from './DateTimeHospital.module.css'

const hospitalName = import.meta.env.VITE_HOSPITAL_NAME?.trim()

/** Live date/time in the page header (Dashboard spec §3/§11) — real client clock, refreshed every 30s, never a static render-time snapshot. */
export function DateTimeHospital() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className={styles.wrapper}>
      <div className={styles.date}>{format(now, 'EEE, MMM d, yyyy')}</div>
      <div className={styles.time}>{format(now, 'h:mm a')}</div>
      {hospitalName && <div className={styles.hospital}>{hospitalName}</div>}
    </div>
  )
}
