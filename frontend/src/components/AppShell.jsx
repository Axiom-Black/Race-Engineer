// ByteCraft Racing — authenticated app shell (S5 back half).
// View states: list (sessions or empty state) -> upload -> back to list;
// list -> detail -> back to list. The S5 front half shipped the frame and an
// honest disabled-upload empty state; this wires the real upload -> parse ->
// persist -> view loop on top of it, plus demo-session seeding: a brand-new
// account with zero sessions gets the fixture auto-ingested (S5 plan Step 5)
// so the dashboard is never empty on first sign-in.
import { useCallback, useEffect, useRef, useState } from 'react'
import { C, font } from '../theme'
import { useAuth } from '../lib/auth'
import { Wordmark, Button } from './ui'
import { listSessions } from '../lib/sessions'
import { seedDemoSession } from '../lib/demo'
import UploadDropzone from './UploadDropzone'
import SessionList from './SessionList'
import SessionDetail from './SessionDetail'

export default function AppShell() {
  const { user, signOut } = useAuth()
  const [signingOut, setSigningOut] = useState(false)
  const [view, setView] = useState('list') // 'list' | 'upload' | 'detail'
  const [selectedId, setSelectedId] = useState(null)
  const [sessions, setSessions] = useState(null) // null = loading
  const [loadError, setLoadError] = useState('')
  const [seedingDemo, setSeedingDemo] = useState(false)
  const seedAttempted = useRef(false)

  const refresh = useCallback(() => {
    listSessions()
      .then(setSessions)
      .catch((err) => setLoadError(err.message))
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Idempotent by construction: only fires once per mount, and only when the
  // first real load confirms zero sessions exist for this account.
  useEffect(() => {
    if (sessions === null || sessions.length > 0 || seedAttempted.current) return
    seedAttempted.current = true
    setSeedingDemo(true)
    seedDemoSession()
      .then(refresh)
      .catch((err) => setLoadError(`Couldn't load your demo session: ${err.message}`))
      .finally(() => setSeedingDemo(false))
  }, [sessions, refresh])

  async function handleSignOut() {
    setSigningOut(true)
    try {
      await signOut()
    } finally {
      setSigningOut(false)
    }
  }

  function handleUploaded(sessionId) {
    refresh()
    setSelectedId(sessionId)
    setView('detail')
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
          <span
            style={{
              color: C.dim,
              fontSize: 13,
              maxWidth: 220,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
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
        {loadError && <p style={{ color: C.danger, fontSize: 13 }}>{loadError}</p>}

        {sessions === null && !loadError && <p style={{ color: C.dim }}>Loading your garage…</p>}

        {sessions !== null && seedingDemo && (
          <p style={{ color: C.dim }}>Setting up a demo session so you have something to look at…</p>
        )}

        {sessions !== null && !seedingDemo && view === 'list' && sessions.length === 0 && (
          <EmptyState onUploadClick={() => setView('upload')} />
        )}

        {sessions !== null && view === 'list' && sessions.length > 0 && (
          <SessionList
            sessions={sessions}
            onSelect={(id) => {
              setSelectedId(id)
              setView('detail')
            }}
            onUploadClick={() => setView('upload')}
          />
        )}

        {view === 'upload' && (
          <UploadDropzone onUploaded={handleUploaded} onCancel={() => setView('list')} />
        )}

        {view === 'detail' && selectedId && (
          <SessionDetail sessionId={selectedId} onBack={() => setView('list')} />
        )}
      </main>
    </div>
  )
}

function EmptyState({ onUploadClick }) {
  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ color: C.silver3, fontSize: 22, fontWeight: 700, margin: '0 0 4px' }}>
          Your garage
        </h1>
        <p style={{ color: C.dim, fontSize: 14, margin: 0 }}>
          Sessions you upload will appear here.
        </p>
      </div>
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
          <Button onClick={onUploadClick}>Upload session</Button>
        </div>
      </div>
    </div>
  )
}
