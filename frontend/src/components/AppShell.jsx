// ByteCraft Racing — authenticated app shell + empty-state dashboard.
// What a signed-in driver lands on. The upload → parse → dashboard core loop
// is S5; this increment ships the frame and an honest empty state that points
// at the next step without faking a capability that isn't wired yet.
import { useState } from 'react'
import { C, font } from '../theme'
import { useAuth } from '../lib/auth'
import { Wordmark, Button } from './ui'

export default function AppShell() {
  const { user, signOut } = useAuth()
  const [signingOut, setSigningOut] = useState(false)

  async function handleSignOut() {
    setSigningOut(true)
    try {
      await signOut()
    } finally {
      // On success the auth listener unmounts this shell; the reset only
      // matters if sign-out failed and we stay mounted.
      setSigningOut(false)
    }
  }

  const initial = (user?.email?.[0] || '?').toUpperCase()

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: font.ui }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 24px',
          borderBottom: `1px solid ${C.line}`,
          background: C.panel,
        }}
      >
        <Wordmark size={16} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            title={user?.email}
            style={{
              width: 30,
              height: 30,
              borderRadius: '50%',
              background: C.pinkBg,
              color: C.pink,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: 13,
            }}
          >
            {initial}
          </div>
          <span style={{ color: C.dim, fontSize: 13, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user?.email}
          </span>
          <button
            onClick={handleSignOut}
            disabled={signingOut}
            style={{
              background: 'transparent',
              border: `1px solid ${C.line}`,
              color: C.silver2,
              borderRadius: 6,
              padding: '6px 12px',
              fontSize: 13,
              cursor: signingOut ? 'not-allowed' : 'pointer',
              fontFamily: font.ui,
            }}
          >
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </header>

      <main style={{ maxWidth: 960, margin: '0 auto', padding: '32px 24px' }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ color: C.silver3, fontSize: 22, fontWeight: 700, margin: '0 0 4px' }}>
            Your garage
          </h1>
          <p style={{ color: C.dim, fontSize: 14, margin: 0 }}>
            Sessions you upload will appear here.
          </p>
        </div>

        <EmptyState />
      </main>
    </div>
  )
}

function EmptyState() {
  return (
    <div
      style={{
        border: `1px dashed ${C.line}`,
        borderRadius: 12,
        background: C.panel,
        padding: '48px 32px',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: 12,
          background: C.pinkBg,
          border: `1px solid ${C.pinkBd}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 18px',
          fontSize: 26,
        }}
        aria-hidden="true"
      >
        🏁
      </div>
      <h2 style={{ color: C.silver3, fontSize: 18, fontWeight: 700, margin: '0 0 8px' }}>
        Upload your first session
      </h2>
      <p style={{ color: C.dim, fontSize: 14, lineHeight: 1.6, maxWidth: 460, margin: '0 auto 22px' }}>
        Export a session from Le Mans Ultimate as a{' '}
        <code style={{ fontFamily: font.mono, color: C.silver2 }}>.ld</code> +{' '}
        <code style={{ fontFamily: font.mono, color: C.silver2 }}>.ldx</code> +{' '}
        <code style={{ fontFamily: font.mono, color: C.silver2 }}>.svm</code> set. We parse it
        in your browser and show every channel, lap by lap.
      </p>
      <div style={{ maxWidth: 260, margin: '0 auto' }}>
        <Button disabled>Upload session</Button>
      </div>
      <p style={{ color: C.dim, fontSize: 12, marginTop: 12 }}>
        Session upload &amp; the telemetry dashboard land in the next update.
      </p>
    </div>
  )
}
