import { useAuth } from '@/app/providers/useAuth'
import { getGreeting } from '../greeting'
import styles from './WelcomePanel.module.css'

/**
 * Branded welcome strip (Dashboard spec §4). A restrained clinical
 * photograph on the right, purpose-built by the user as a wide banner
 * with the indigo fade already composited into the image itself (left
 * edge solid brand-indigo, fading into the photo) — `.panel` uses it
 * directly as its own background rather than layering a separate CSS
 * fade on top of a plain photo crop. A thin CSS gradient reinforces the
 * fade at the far left edge as a responsive safety net (so text stays
 * legible even if the panel's rendered aspect ratio doesn't exactly
 * match the source image's). Purely decorative — never a stand-in for
 * real clinical data.
 */
export function WelcomePanel() {
  const { user } = useAuth()
  const greeting = getGreeting(new Date())
  const displayName = user?.name?.trim() || user?.username || ''

  return (
    <section className={styles.panel} aria-label="Welcome">
      <div className={styles.textFade} aria-hidden="true" />
      <div className={styles.text}>
        <p className={styles.eyebrow}>{greeting.toUpperCase()}</p>
        <h2 className={styles.name} dir="auto">
          {displayName}
        </h2>
        <p className={styles.message}>
          Here is what is happening in the ER today. HCopilot helps you stay informed, act faster, and keep patient flow visible.
        </p>
      </div>
    </section>
  )
}
