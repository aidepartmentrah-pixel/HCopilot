import { useCallback, useState } from 'react'
import type { ReactNode } from 'react'
import { authApi } from '@/api/auth'
import type { AuthUser } from '@/types/auth'
import { AuthContext } from './authContext'

const SESSION_KEY = 'hcopilot_session'

function readStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw) as AuthUser) : null
  } catch {
    return null
  }
}

/**
 * There is no token/session-cookie mechanism on the backend (auth/api.py's
 * /login just verifies credentials and returns the user row) — the old
 * frontend's own auth.js persists that row to localStorage and treats its
 * presence as "signed in". This is the same real, already-working contract,
 * just moved into a React context so TopNavigation/LoginPage can share it.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => readStoredUser())

  const login = useCallback(async (username: string, password: string) => {
    const { user: loggedInUser } = await authApi.login(username, password)
    localStorage.setItem(SESSION_KEY, JSON.stringify(loggedInUser))
    setUser(loggedInUser)
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(SESSION_KEY)
    setUser(null)
  }, [])

  return <AuthContext.Provider value={{ user, login, logout }}>{children}</AuthContext.Provider>
}
