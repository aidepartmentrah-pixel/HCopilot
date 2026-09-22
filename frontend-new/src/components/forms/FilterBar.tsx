import type { ReactNode } from 'react'
import styles from './FilterBar.module.css'

/** Toolbar row for search + filter controls above a table/board (§35 — filters belong in a toolbar). */
export function FilterBar({ children }: { children: ReactNode }) {
  return <div className={styles.filterBar}>{children}</div>
}
