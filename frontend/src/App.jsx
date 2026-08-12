// ByteCraft Racing — root. Routes on auth state: a signed-in driver gets the
// app shell, everyone else gets the sign-in / sign-up screen. Replaces the S4
// smoke screen; the onboarding spine (S5 front half) starts here.
import { AuthProvider, useAuth } from './lib/auth'
import { C, font } from './theme'
import AuthScreen from './components/AuthScreen'
import AppShell from './components/AppShell'
import { Wordmark } from './components/ui'

function Gate() {
  const { session, loading } = useAuth()

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: C.bg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: font.ui,
        }}
      >
        <div style={{ opacity: 0.6 }}>
          <Wordmark size={18} />
        </div>
      </div>
    )
  }

  return session ? <AppShell /> : <AuthScreen />
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  )
}
