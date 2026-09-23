import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { AuthProvider } from '@/app/providers/AuthProvider'
import { NoProductionModelState } from './NoProductionModelState'

const SESSION_KEY = 'hcopilot_session'

function renderWithSession(user: Record<string, unknown> | null) {
  if (user) localStorage.setItem(SESSION_KEY, JSON.stringify(user))
  return render(
    <MemoryRouter>
      <AuthProvider>
        <NoProductionModelState />
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('NoProductionModelState', () => {
  afterEach(() => {
    localStorage.removeItem(SESSION_KEY)
  })

  it('always shows the real, honest empty-state title — never a fake chart', () => {
    renderWithSession(null)
    expect(screen.getByText('No production prediction model available')).toBeInTheDocument()
  })

  it('offers "Open AI & Models" for a user whose real sections include settings access (§29)', () => {
    renderWithSession({ user_id: 1, username: 'admin', name: 'Administrator', role: 'admin', sections: 'home,settings', settings_tabs: '', statistics_tabs: '' })
    expect(screen.getByRole('link', { name: 'Open AI & Models' })).toBeInTheDocument()
  })

  it('shows "Contact an administrator" instead, for a user without settings access', () => {
    renderWithSession({ user_id: 2, username: 'triage', name: '', role: 'user', sections: 'patients', settings_tabs: '', statistics_tabs: '' })
    expect(screen.queryByRole('link', { name: 'Open AI & Models' })).not.toBeInTheDocument()
    expect(screen.getByText(/Contact an administrator/)).toBeInTheDocument()
  })
})
