import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'

const SESSION_KEY = 'hcopilot_session'

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

afterEach(() => {
  localStorage.removeItem(SESSION_KEY)
  vi.unstubAllGlobals()
})

describe('App', () => {
  it('shows the sign-in screen when there is no session', () => {
    render(<App />)
    expect(screen.getByRole('button', { name: 'Sign In' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Primary' })).not.toBeInTheDocument()
  })

  it('renders the app shell for an authenticated session', () => {
    // TopNavigation's GlobalSearch fetches active/discharged patients on
    // mount — stub fetch so this render test doesn't make a real network
    // call (same convention as useBeds.test.tsx).
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ patients: [], total: 0 })))
    localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ user_id: 1, username: 'admin', name: 'Administrator', role: 'admin', sections: '', settings_tabs: '', statistics_tabs: '' }),
    )
    render(<App />)
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Administrator/i })).toBeInTheDocument()
  })
})
