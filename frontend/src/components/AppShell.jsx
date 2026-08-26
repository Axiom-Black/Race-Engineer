// ByteCraft Racing — authenticated app shell (S5 back half).
// Navigation modeled on the referenced prototypes' workflow:
//   - ByteCraft_v12_Merged.jsx DriverApp: header -> tab bar -> tab content
//     (SESSIONS / RACE ENGINEER / PROGRESSION / LIBRARIES)
//   - ByteCraft_SessionUpload.jsx: the upload/ingest visual pattern (see
//     UploadDropzone.jsx, SessionDetail.jsx's channel inventory)
//   - RaceEngineeringAgent_v2.jsx: the domain-agent structure referenced in
//     the Race Engineer placeholder (dark this phase, not implemented)
// Race Engineer opens the Engineering Run workspace, which reports which of the
// ten agents a driver's export can actually feed and runs no analysis at all —
// standing bar: no faked capability; CLAUDE.md: resist shipping the agent
// early. Libraries stays a genuinely disabled tab that explains why it is dark
// rather than pretending to work.
import { useState } from 'react'
import { C, font } from '../theme'
import { useAuth } from '../lib/auth'
import { Wordmark } from './ui'
import BuildMarker from './BuildMarker'
import TabBar from './TabBar'
import SessionsTab from './SessionsTab'
import ProgressionTab from './ProgressionTab'
import EngineeringRunTab from './EngineeringRunTab'
import { LibrariesPlaceholder } from './PhasePlaceholder'

const TAB_CONTENT = {
  sessions: SessionsTab,
  progression: ProgressionTab,
  engineer: EngineeringRunTab,
  libraries: LibrariesPlaceholder,
}

export default function AppShell() {
  const { user, signOut } = useAuth()
  const [signingOut, setSigningOut] = useState(false)
  const [tab, setTab] = useState('sessions')

  async function handleSignOut() {
    setSigningOut(true)
    try {
      await signOut()
    } finally {
      setSigningOut(false)
    }
  }

  const initial = (user?.email?.[0] || '?').toUpperCase()
  const TabContent = TAB_CONTENT[tab]

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Wordmark size={16} />
          <BuildMarker />
        </div>
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

      <TabBar active={tab} onChange={setTab} />

      <main style={{ maxWidth: tab === 'engineer' ? 1180 : 960, margin: '0 auto', padding: '32px 24px' }}>
        <TabContent />
      </main>
    </div>
  )
}
