import { useAuth } from '@/app/providers/useAuth'
import { getGreeting } from '../greeting'
import styles from './WelcomePanel.module.css'

/**
 * Compact branded welcome strip (Dashboard spec §4, 180-220px). The spec
 * asks for a "restrained clinical photograph" on the right — no such
 * asset exists in this repo, and generating or sourcing one now would
 * mean either fabricating a "real" hospital photo or reusing the GPT
 * mockup images as literal content, both of which this mission's own
 * no-fabrication rule (source spec §24, kickoff prompt's standing rules)
 * rules out. Uses a locally-rendered abstract pattern in the brand
 * palette instead — professional, cool-toned, zero network dependency,
 * and honestly not a photograph rather than pretending to be one.
 */
export function WelcomePanel() {
  const { user } = useAuth()
  const greeting = getGreeting(new Date())
  const displayName = user?.name?.trim() || user?.username || ''

  return (
    <section className={styles.panel} aria-label="Welcome">
      <div className={styles.text}>
        <p className={styles.eyebrow}>{greeting.toUpperCase()}</p>
        <h2 className={styles.name} dir="auto">
          {displayName}
        </h2>
        <p className={styles.message}>
          Here is what is happening in the ER today. HCopilot helps you stay informed, act faster, and keep patient flow visible.
        </p>
      </div>
      <div className={styles.artwork} aria-hidden="true">
        <svg viewBox="0 0 240 220" fill="none" className={styles.artworkSvg}>
          <circle cx="190" cy="40" r="90" fill="rgba(255,255,255,0.06)" />
          <circle cx="60" cy="190" r="70" fill="rgba(255,255,255,0.05)" />
          <circle cx="150" cy="170" r="30" fill="rgba(255,255,255,0.08)" />
        </svg>
      </div>
    </section>
  )
}
