import { AppProviders } from '@/app/providers/AppProviders'
import { AuthProvider } from '@/app/providers/AuthProvider'
import { useAuth } from '@/app/providers/useAuth'
import { AppRouter } from '@/app/router/AppRouter'
import { LoginPage } from '@/features/auth/LoginPage'

/** Gates the whole app behind a real session (see AuthProvider) — nothing beyond this renders for a signed-out visitor. */
function AuthGate() {
  const { user } = useAuth()
  if (!user) return <LoginPage />
  return (
    <AppProviders>
      <AppRouter />
    </AppProviders>
  )
}

function App() {
  return (
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  )
}

export default App
