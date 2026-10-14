import { Component, type ErrorInfo, type ReactNode } from 'react'
import { ErrorState } from './ErrorState'
import { Button } from '../ui/Button'

/** Failure to fetch a lazily loaded page file — what a tab left open across an update hits (the old file is gone). */
export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /dynamically imported module|Importing a module script failed|Unable to preload CSS|Loading chunk .* failed|ChunkLoadError/i.test(message)
}

const RELOAD_GUARD_KEY = 'hcopilot-chunk-reload-at'
const RELOAD_GUARD_MS = 15_000

/** Reload once to pick up the new build; never loop if the file is genuinely missing. */
export function reloadOnceForNewBuild(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) ?? 0)
    if (Date.now() - last < RELOAD_GUARD_MS) return false
    sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()))
  } catch {
    return false
  }
  window.location.reload()
  return true
}

interface ErrorBoundaryProps {
  children: ReactNode
  /** Changing this (e.g. the pathname) clears a previous error so navigating away recovers. */
  resetKey?: string
}

interface ErrorBoundaryState {
  error: Error | null
}

/**
 * Without a boundary, any error while rendering unmounts the whole React tree and users see a blank
 * page. This keeps the rest of the app (navigation) alive, reloads automatically when the cause is a
 * stale tab after an update, and otherwise shows what happened with a way to recover.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('HCopilot UI error:', error, info.componentStack)
    if (isChunkLoadError(error)) reloadOnceForNewBuild()
  }

  componentDidUpdate(prev: ErrorBoundaryProps) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null })
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    const stale = isChunkLoadError(error)
    return (
      <div>
        <ErrorState
          title={stale ? 'HCopilot was updated' : 'Something went wrong'}
          description={
            stale
              ? 'This page was opened before an update. Reload to get the new version — nothing you saved is lost.'
              : `This page could not be displayed (${error.message || 'unknown error'}). Reload the page; if it keeps happening, tell the support team what you were doing.`
          }
        />
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 8 }}>
          <Button onClick={() => window.location.reload()}>Reload page</Button>
          {!stale && (
            <Button variant="secondary" onClick={() => this.setState({ error: null })}>
              Try again
            </Button>
          )}
        </div>
      </div>
    )
  }
}
