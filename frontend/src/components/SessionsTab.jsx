// ByteCraft Racing — Sessions tab (S5 back half).
// View states: list (sessions or empty state) -> upload -> back to list;
// list -> detail -> back to list. Includes demo-session seeding: a brand-new
// account with zero sessions gets the fixture auto-ingested (S5 plan Step 5)
// so the dashboard is never empty on first sign-in.
// Extracted from AppShell so the tab-bar shell (TabBar.jsx) can host this
// alongside Progression / Race Engineer / Libraries.
import { useCallback, useEffect, useRef, useState } from 'react'
import { C, font } from '../theme'
import { Button } from './ui'
import { listSessions } from '../lib/sessions'
import { seedDemoSession } from '../lib/demo'
import FaultNotice from './FaultNotice'
import UploadDropzone from './UploadDropzone'
import SessionList from './SessionList'
import SessionReport from './SessionReport'

export default function SessionsTab() {
  const [view, setView] = useState('list') // 'list' | 'upload' | 'detail'
  const [selectedId, setSelectedId] = useState(null)
  const [sessions, setSessions] = useState(null) // null = loading
  const [loadError, setLoadError] = useState(null) // the error object, not its message
  const [seedingDemo, setSeedingDemo] = useState(false)
  const seedAttempted = useRef(false)

  const refresh = useCallback(() => {
    setLoadError(null)
    listSessions()
      .then(setSessions)
      .catch(setLoadError)
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
      .catch(setLoadError)
      .finally(() => setSeedingDemo(false))
  }, [sessions, refresh])

  function handleUploaded(sessionId) {
    refresh()
    setSelectedId(sessionId)
    setView('detail')
  }

  return (
    <>
      {loadError && <FaultNotice error={loadError} onRetry={refresh} style={{ marginBottom: 14 }} />}

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
        <SessionReport sessionId={selectedId} onBack={() => setView('list')} />
      )}
    </>
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
