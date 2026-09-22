/** Mirrors auth/users_manager.py's UsersManager._row() — the shape returned by both /login and /users. */
export interface AuthUser {
  user_id: number
  username: string
  name: string
  role: string
  sections: string
  settings_tabs: string
  statistics_tabs: string
}

/** POST /api/auth/login response body. */
export interface LoginResponse {
  ok: boolean
  user: AuthUser
}
