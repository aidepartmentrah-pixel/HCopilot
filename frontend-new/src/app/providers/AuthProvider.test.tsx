import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from './AuthProvider'
import { useAuth } from './useAuth'

const SESSION_KEY = 'hcopilot_session'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function wrapper({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>
}

afterEach(() => {
  localStorage.removeItem(SESSION_KEY)
  vi.unstubAllGlobals()
})

describe('AuthProvider', () => {
  it('starts signed out when no session is stored', () => {
    const { result } = renderHook(() => useAuth(), { wrapper })
    expect(result.current.user).toBeNull()
  })

  it('rehydrates a previously stored session on mount', () => {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ user_id: 1, username: 'admin', name: 'Administrator', role: 'admin' }))
    const { result } = renderHook(() => useAuth(), { wrapper })
    expect(result.current.user?.username).toBe('admin')
  })

  it('logs in against the real /api/auth/login contract and persists the session', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ ok: true, user: { user_id: 1, username: 'admin', name: 'Administrator', role: 'admin', sections: '', settings_tabs: '', statistics_tabs: '' } }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useAuth(), { wrapper })

    await act(async () => {
      await result.current.login('admin', 'admin')
    })

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/login',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ username: 'admin', password: 'admin' }) }),
    )
    await waitFor(() => expect(result.current.user?.name).toBe('Administrator'))
    expect(JSON.parse(localStorage.getItem(SESSION_KEY) ?? '{}').username).toBe('admin')
  })

  it('rejects on invalid credentials and leaves no session behind', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ detail: 'Invalid username or password' }, 401)))
    const { result } = renderHook(() => useAuth(), { wrapper })

    await expect(act(async () => result.current.login('admin', 'wrong'))).rejects.toThrow()
    expect(result.current.user).toBeNull()
    expect(localStorage.getItem(SESSION_KEY)).toBeNull()
  })

  it('logout clears both state and storage', () => {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ user_id: 1, username: 'admin', name: 'Administrator', role: 'admin' }))
    const { result } = renderHook(() => useAuth(), { wrapper })
    expect(result.current.user).not.toBeNull()

    act(() => result.current.logout())

    expect(result.current.user).toBeNull()
    expect(localStorage.getItem(SESSION_KEY)).toBeNull()
  })
})
