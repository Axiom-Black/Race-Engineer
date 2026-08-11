// ByteCraft Racing — sign in / sign up (email + password).
// The onboarding front door. Supabase Auth owns identity; on sign-up the free
// tier sends a confirmation email, so a sign-up with no returned session means
// "confirm your email first" rather than an error.
import { useState } from 'react'
import { C, font } from '../theme'
import { useAuth } from '../lib/auth'
import { Wordmark, Field, Button, Banner } from './ui'

const MIN_PASSWORD = 8

export default function AuthScreen() {
  const { signIn, signUp } = useAuth()
  const [mode, setMode] = useState('signin') // 'signin' | 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const isSignup = mode === 'signup'

  function switchMode(next) {
    setMode(next)
    setError('')
    setNotice('')
  }

  function validate() {
    if (!email.trim()) return 'Enter your email address.'
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return 'That email address looks off.'
    if (!password) return 'Enter your password.'
    if (isSignup && password.length < MIN_PASSWORD)
      return `Password must be at least ${MIN_PASSWORD} characters.`
    return ''
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setNotice('')
    const problem = validate()
    if (problem) {
      setError(problem)
      return
    }
    setBusy(true)
    try {
      if (isSignup) {
        const { data, error: err } = await signUp(email.trim(), password)
        if (err) throw err
        // No session returned → Supabase is awaiting email confirmation.
        if (!data.session) {
          setNotice(
            'Account created. Check your inbox for a confirmation link, then sign in.'
          )
          setMode('signin')
          setPassword('')
        }
        // If a session IS returned (confirmation disabled), the auth listener
        // swaps this screen for the app automatically — nothing to do here.
      } else {
        const { error: err } = await signIn(email.trim(), password)
        if (err) throw err
        // Success → auth listener routes to the app.
      }
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: C.bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        fontFamily: font.ui,
      }}
    >
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ marginBottom: 28, textAlign: 'center' }}>
          <Wordmark size={22} />
          <div style={{ color: C.dim, fontSize: 13, marginTop: 10 }}>
            Sim-racing telemetry & AI race engineering for Le Mans Ultimate
          </div>
        </div>

        <div
          style={{
            background: C.panel,
            border: `1px solid ${C.line}`,
            borderRadius: 10,
            padding: 28,
          }}
        >
          <h1 style={{ color: C.silver3, fontSize: 18, fontWeight: 700, margin: '0 0 4px' }}>
            {isSignup ? 'Create your account' : 'Sign in'}
          </h1>
          <p style={{ color: C.dim, fontSize: 13, margin: '0 0 20px' }}>
            {isSignup
              ? 'Start with the solo-driver telemetry pilot — free.'
              : 'Welcome back to the garage.'}
          </p>

          <Banner kind="error">{error}</Banner>
          <Banner kind="success">{notice}</Banner>

          <form onSubmit={handleSubmit}>
            <Field
              label="Email"
              type="email"
              value={email}
              onChange={setEmail}
              placeholder="you@example.com"
              autoComplete="email"
              disabled={busy}
            />
            <Field
              label="Password"
              type="password"
              value={password}
              onChange={setPassword}
              placeholder={isSignup ? `At least ${MIN_PASSWORD} characters` : '••••••••'}
              autoComplete={isSignup ? 'new-password' : 'current-password'}
              disabled={busy}
            />
            <div style={{ marginTop: 4 }}>
              <Button type="submit" disabled={busy}>
                {busy ? 'Working…' : isSignup ? 'Create account' : 'Sign in'}
              </Button>
            </div>
          </form>

          <div
            style={{
              marginTop: 20,
              paddingTop: 16,
              borderTop: `1px solid ${C.line}`,
              fontSize: 13,
              color: C.dim,
              textAlign: 'center',
            }}
          >
            {isSignup ? 'Already have an account?' : 'New to ByteCraft?'}{' '}
            <button
              type="button"
              onClick={() => switchMode(isSignup ? 'signin' : 'signup')}
              style={{
                background: 'none',
                border: 'none',
                color: C.pink,
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: 13,
                padding: 0,
              }}
            >
              {isSignup ? 'Sign in' : 'Create one'}
            </button>
          </div>
        </div>

        <div style={{ textAlign: 'center', marginTop: 18, color: C.dim, fontSize: 11 }}>
          © 2026 Axiom Black, LLC · Proprietary &amp; confidential
        </div>
      </div>
    </div>
  )
}

// Map Supabase's raw messages to something a driver can act on.
function friendlyError(err) {
  const msg = (err?.message || String(err)).toLowerCase()
  if (msg.includes('invalid login')) return 'Wrong email or password.'
  if (msg.includes('already registered') || msg.includes('already been registered'))
    return 'That email is already registered — try signing in.'
  if (msg.includes('email not confirmed'))
    return 'Confirm your email first — check your inbox for the link.'
  if (msg.includes('rate limit') || msg.includes('too many'))
    return 'Too many attempts. Wait a minute and try again.'
  return err?.message || 'Something went wrong. Try again.'
}
