import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '@/app/providers/AuthProvider'
import { TopNavigation } from './TopNavigation'

const SESSION_KEY = 'hcopilot_session'

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

function renderShell(initialPath = '/') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <AuthProvider>
          <TopNavigation />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('TopNavigation', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ patients: [], total: 0 })))
    localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ user_id: 1, username: 'jsmith', name: 'Jamie Smith', role: 'nurse', sections: '', settings_tabs: '', statistics_tabs: '' }),
    )
  })

  afterEach(() => {
    localStorage.removeItem(SESSION_KEY)
    vi.unstubAllGlobals()
  })

  it('renders the logo, every nav destination, search, notifications, and the real signed-in user', () => {
    renderShell()

    expect(screen.getByRole('img', { name: 'HCopilot' })).toBeInTheDocument()
    expect(screen.getByText('HCopilot')).toBeInTheDocument()

    const nav = within(screen.getByRole('navigation', { name: 'Primary' }))
    for (const label of ['Home', 'ER ISBAR Entry', 'Live ER', 'History', 'Statistics', 'Settings']) {
      expect(nav.getByRole('link', { name: new RegExp(label) })).toBeInTheDocument()
    }

    expect(screen.getByRole('combobox', { name: /search patients/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /notifications/i })).toBeInTheDocument()

    // Real session data, never a hardcoded example user.
    expect(screen.getByText('Jamie Smith')).toBeInTheDocument()
    expect(screen.getByText('nurse')).toBeInTheDocument()
    expect(screen.queryByText('Dr. Sarah Chen')).not.toBeInTheDocument()
  })

  it('marks the current route as active in the nav', () => {
    renderShell('/live-er')
    const liveErLink = screen.getByRole('link', { name: /Live ER/ })
    expect(liveErLink.className).toMatch(/navLinkActive/)
    const homeLink = screen.getByRole('link', { name: /^Home$/ })
    expect(homeLink.className).not.toMatch(/navLinkActive/)
  })

  it('nav links are reachable by keyboard (real anchors, real tab order)', async () => {
    const user = userEvent.setup()
    renderShell()
    const homeLink = screen.getByRole('link', { name: /^Home$/ })
    homeLink.focus()
    expect(homeLink).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('link', { name: /ER ISBAR Entry/ })).toHaveFocus()
  })

  it('opens the user menu and can sign out', async () => {
    const user = userEvent.setup()
    renderShell()
    await user.click(screen.getByRole('button', { name: /Jamie Smith/i }))
    const signOut = await screen.findByRole('menuitem', { name: /sign out/i })
    await user.click(signOut)
    expect(localStorage.getItem(SESSION_KEY)).toBeNull()
  })
})
