import { Outlet } from 'react-router-dom'
import { TopNavigation } from '../navigation/TopNavigation'
import styles from './AppShell.module.css'

/** Every major page renders inside this shell (§7) — the top bar is never redesigned per page. */
export function AppShell() {
  return (
    <div className={styles.shell}>
      <TopNavigation />
      <main className={styles.canvas}>
        <div className={styles.content}>
          <Outlet />
        </div>
      </main>
    </div>
  )
}
