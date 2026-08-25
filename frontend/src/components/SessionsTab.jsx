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
import { listSessions, deleteSession } from '../lib/sessions'
import { seedDemoSession } from '../lib/demo'
import { isDemoDismissed, markDemoDismissed } from '../lib/prefs'
import { useAuth } from '../lib/auth'
import FaultNotice from './FaultNotice'
import UploadDropzone from './UploadDropzone'
import SessionList from './SessionList'
import SessionReport from './SessionReport'

export default function SessionsTab() {
  const { user } = useAuth()
  const [view, setView] = useState('list') // 'list' | 'upload' | 'detail'
  const [selectedId, setSelectedId] = useState(null)
  const [sessions, setSessions] = useState(null) // null = loading
  const [loadError, setLoadError] = useState(null) // the error object, not its message
  const [seedingDemo, setSeedingDemo] = useState(false)
  // Kept separate from loadError on purpose. A failed demo seed is NOT a failed
  // garage load: the driver's account is fine and empty, and telling them their
  // sessions could not be loaded is both false and alarming. It also needs a
  // different retry — refreshing the list cannot re-seed.
  const [seedError, setSeedError] = useState(null)
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

  // Seed the demo, and let it be retried. `force` is what the retry button
  // passes: the ref guard exists to stop the effect looping, and without a way
  // past it the retry could only re-list an empty garage forever.
  const attemptSeed = useCallback(
    (force = false) => {
      if (seedAttempted.current && !force) return
      seedAttempted.current = true
      setSeedError(null)
      setSeedingDemo(true)
      seedDemoSession()
        .then(refresh)
        .catch(setSeedError)
        .finally(() => setSeedingDemo(false))
    },
    [refresh],
  )

  // Only fires when the first real load confirms zero sessions exist for this
  // account.
  //
  // The dismissal check is what stops the demo resurrecting: without it, a
  // driver who deletes the demo gets it seeded again on their next sign-in,
  // because "zero sessions" is exactly the state deleting it produces.
  useEffect(() => {
    if (sessions === null || sessions.length > 0) return
    if (isDemoDismissed(user?.id)) return
    attemptSeed()
  }, [sessions, user, attemptSeed])

  // Deleting the demo is a dismissal, not just a delete — record it before the
  // refresh, or the seeding effect races back in and re-creates it.
  async function handleDelete(session) {
    setLoadError(null)
    try {
      await deleteSession(session.id)
      if (session.is_demo) {
        seedAttempted.current = true
        markDemoDismissed(user?.id)
      }
      refresh()
    } catch (err) {
      // Storage or row delete failed. The session still exists — say so via the
      // same classified notice everything else uses, rather than a silent no-op
      // that looks like the delete worked.
      setLoadError(err)
    }
  }

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

      {/* A failed seed is reported as what it is — the demo is missing, the
          account is fine — and its retry re-seeds rather than re-listing. The
          empty state still renders below it, so the driver always has a working
          way forward instead of a dead end. */}
      {seedError && !seedingDemo && (
        <FaultNotice
          error={seedError}
          onRetry={() => attemptSeed(true)}
          title="Demo session unavailable"
          context="We couldn't set up the demo session. Your garage is ready either way — upload a session, or try the demo again."
          style={{ marginBottom: 14 }}
        />
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
          onDelete={handleDelete}
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
