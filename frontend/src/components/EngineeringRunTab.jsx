// ByteCraft Racing — Engineering Run.
//
// Laid out after prototypes/bytecraft-racing-host.jsx's Engineering Run, which
// the owner named as the basis for this layer: a context bar over the session
// being worked on, run-depth tiers, the ten-agent roster down the left, and one
// agent's detail on the right.
//
// WHAT IT DOES *NOT* DO, DELIBERATELY. It does not run an analysis. The agent
// is dark in the Tier 1 Pilot by decision, not by omission (CLAUDE.md), and the
// standing bar against faked capability rules out a page that produces a
// debrief from nothing. "Run analysis" is disabled and says why, in one line,
// where a driver will read it.
//
// WHAT IT DOES DO, WHICH THE PROTOTYPE DID NOT. The prototype filled its metric
// boxes with "— TBD". That is honest and worth nothing. This answers the one
// real question available today: whether the driver's export actually carries
// what each agent will need. LMU ships GTE cars with Tyre Load, Grip Fract and
// Battery permanently empty, and any session can log a channel all-zero — a
// driver who discovers that when the agent launches has wasted a season of
// uploads, and one who discovers it now can change what they export.
//
// That makes the tab payable in the sense WORKING_PLAN §4 means: a capability a
// driver would notice losing, attached to no new infrastructure.
import { useEffect, useMemo, useState } from 'react'
import { C, font } from '../theme'
import { listSessions, getSession } from '../lib/sessions'
import { formatSessionDate } from '../lib/sessionTime'
import FaultNotice from './FaultNotice'
import { AGENTS, RUN_TIERS, rosterReadiness, tierById, tierReadiness, tierRuns } from '../lib/agents'

const STATE_STYLE = {
  ready: { color: C.good, label: 'READY' },
  partial: { color: C.warn, label: 'PARTIAL' },
  blocked: { color: C.danger, label: 'NO DATA' },
  derived: { color: C.silver2, label: 'DERIVED' },
}

const MONO_LABEL = { fontFamily: font.mono, fontSize: 10, color: C.dim, letterSpacing: 1 }

function Dot({ state }) {
  const s = STATE_STYLE[state] ?? STATE_STYLE.derived
  return <span title={s.label} style={{ width: 8, height: 8, borderRadius: 99, background: s.color, display: 'inline-block', flexShrink: 0 }} />
}

function ChannelList({ title, names, color }) {
  if (!names.length) return null
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ ...MONO_LABEL, color, marginBottom: 6 }}>
        {title} · {names.length}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {names.map((n) => (
          <span
            key={n}
            style={{
              fontFamily: font.mono, fontSize: 10.5, color: C.silver2,
              border: `1px solid ${color}44`, background: `${color}0F`,
              borderRadius: 5, padding: '3px 7px',
            }}
          >
            {n}
          </span>
        ))}
      </div>
    </div>
  )
}

function AgentDetail({ agent, read, session, inTier }) {
  const s = STATE_STYLE[read.state]
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: C.silver3, letterSpacing: '-0.01em' }}>
          {agent.name}
        </h3>
        <span style={{ ...MONO_LABEL, border: `1px solid ${C.line}`, borderRadius: 4, padding: '3px 6px' }}>
          {agent.code}
        </span>
        <span style={{ fontFamily: font.mono, fontSize: 10, color: s.color, border: `1px solid ${s.color}66`, background: `${s.color}14`, borderRadius: 4, padding: '3px 7px', letterSpacing: 1 }}>
          {s.label}
        </span>
        {!inTier && (
          <span style={{ ...MONO_LABEL, color: C.dim }}>not run at this depth</span>
        )}
      </div>
      <p style={{ color: C.silver2, fontSize: 13, margin: '0 0 10px' }}>{agent.purpose}</p>
      <div style={{ ...MONO_LABEL, marginBottom: 18 }}>
        {[session?.car_class, session?.venue, session?.session_type].filter(Boolean).join(' · ')}
      </div>

      {read.state === 'derived' ? (
        // Not "ready": nothing about this agent's inputs was checked, because
        // it has none. Saying READY would be a claim about unexamined data.
        <div style={{ border: `1px dashed ${C.line}`, borderRadius: 10, padding: 16, color: C.dim, fontSize: 13, lineHeight: 1.6 }}>
          Reads the specialists, not the telemetry. Its readiness is theirs — nothing here to check
          against your export.
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 14 }}>
            <span style={{ fontFamily: font.mono, fontSize: 26, fontWeight: 800, color: s.color }}>
              {Math.round(read.coverage * 100)}%
            </span>
            <span style={{ fontSize: 12, color: C.dim }}>
              of this agent’s {agent.channels.length} inputs carry usable data in this session
            </span>
          </div>
          <ChannelList title="LOGGED" names={read.present} color={C.good} />
          {/* Standing bar: unreliable data is flagged, never hidden. An empty
              channel is not a missing one — it was exported and carries only
              zeros, which is a fact about the sim, not about the upload. */}
          <ChannelList title="EMPTY — LOGGED, ALL ZERO" names={read.empty} color={C.warn} />
          <ChannelList title="NOT IN THIS EXPORT" names={read.missing} color={C.danger} />
        </>
      )}

      <div style={{ marginTop: 20, border: `1px dashed ${C.line}`, borderRadius: 10, padding: 16, color: C.dim, fontSize: 12.5, lineHeight: 1.6 }}>
        The {agent.name} agent’s contribution to the unified engineer report appears here once analysis
        runs server-side in Phase 2. Nothing on this page is generated — it is your own export, checked
        against what the agent will read.
      </div>
    </div>
  )
}

export default function EngineeringRunTab() {
  const [sessions, setSessions] = useState(null)
  const [error, setError] = useState(null)
  const [sessionId, setSessionId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [tierId, setTierId] = useState('standard')
  const [activeId, setActiveId] = useState(AGENTS[0].id)

  useEffect(() => {
    listSessions()
      .then((rows) => {
        setSessions(rows)
        setSessionId((cur) => cur ?? rows[0]?.id ?? null)
      })
      .catch(setError)
  }, [])

  // The channel inventory lives on the session row's summary, which listSessions
  // does not necessarily carry in full — fetch the one being worked on.
  useEffect(() => {
    if (!sessionId) return
    let live = true
    getSession(sessionId)
      .then(({ session }) => { if (live) setDetail(session) })
      .catch((e) => { if (live) setError(e) })
    return () => { live = false }
  }, [sessionId])

  // Memoised off the session, not off `channels` — `?? []` mints a new array
  // every render, which would rebuild the roster on every keystroke.
  const roster = useMemo(() => rosterReadiness(detail?.summary?.channels ?? []), [detail])
  const tier = tierById(tierId)
  const summary = useMemo(() => tierReadiness(tier, roster), [tier, roster])
  const active = AGENTS.find((a) => a.id === activeId) ?? AGENTS[0]

  if (error) return <FaultNotice error={error} />
  if (sessions === null) return <p style={{ color: C.dim }}>Loading…</p>

  if (sessions.length === 0) {
    return (
      <div>
        <h2 style={{ color: C.silver3, fontSize: 18, fontWeight: 900, margin: 0 }}>Engineering Run</h2>
        <p style={{ color: C.dim, fontSize: 13, maxWidth: 520, lineHeight: 1.6, marginTop: 8 }}>
          Upload a session to see which of the ten agents your export can feed.
        </p>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 6, flexWrap: 'wrap' }}>
        <h2 style={{ color: C.silver3, fontSize: 18, fontWeight: 900, margin: 0, letterSpacing: '-0.01em' }}>
          Engineering Run
        </h2>
        <span style={{ ...MONO_LABEL, border: `1px solid ${C.line}`, borderRadius: 5, padding: '4px 9px' }}>
          ANALYSIS · PHASE 2
        </span>
      </div>
      <p style={{ color: C.dim, fontSize: 13, margin: '0 0 18px', maxWidth: 640, lineHeight: 1.55 }}>
        The ten-agent debrief runs server-side in Phase 2. Until it does, this checks your export
        against what each agent reads — so you find a channel your car never logs now, not after a
        season of uploads.
      </p>

      {/* Context bar: the real session, not a dropdown of imaginary ones. */}
      <div
        style={{
          display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap',
          background: C.panel2, border: `1px solid ${C.line}`, borderRadius: 10,
          padding: '13px 16px', marginBottom: 18,
        }}
      >
        <label style={{ display: 'block' }}>
          <div style={{ ...MONO_LABEL, marginBottom: 4 }}>SESSION</div>
          <select
            aria-label="Session"
            value={sessionId ?? ''}
            onChange={(e) => setSessionId(e.target.value)}
            style={{
              background: C.bg, color: C.silver3, border: `1px solid ${C.line}`,
              borderRadius: 6, padding: '7px 10px', fontSize: 12, fontFamily: font.ui,
              minWidth: 260, cursor: 'pointer',
            }}
          >
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {[s.venue, s.car, formatSessionDate(s.recorded_at)].filter(Boolean).join(' · ')}
              </option>
            ))}
          </select>
        </label>

        <div>
          <div style={{ ...MONO_LABEL, marginBottom: 4 }}>RUN DEPTH</div>
          <div style={{ display: 'flex', gap: 5 }}>
            {RUN_TIERS.map((t) => {
              const on = t.id === tierId
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTierId(t.id)}
                  aria-pressed={on}
                  title={t.detail}
                  style={{
                    background: on ? C.pinkBg : 'transparent',
                    border: `1px solid ${on ? C.pinkBd : C.line}`,
                    color: on ? C.pink : C.silver2,
                    borderRadius: 6, padding: '7px 12px', fontSize: 11.5, fontWeight: 700,
                    fontFamily: font.mono, cursor: 'pointer',
                  }}
                >
                  {t.name}
                </button>
              )
            })}
          </div>
        </div>

        <div style={{ flex: 1 }} />

        <button
          type="button"
          disabled
          title="The agent runs server-side in Phase 2 — dark by design in the pilot"
          style={{
            background: C.panel2, border: `1px solid ${C.line}`, color: C.dim,
            borderRadius: 7, padding: '9px 16px', fontSize: 12.5, fontWeight: 700,
            fontFamily: font.ui, cursor: 'not-allowed',
          }}
        >
          Run analysis
        </button>
      </div>

      <div style={{ ...MONO_LABEL, marginBottom: 12 }}>
        {tier.name.toUpperCase()} RUN · {tier.detail.toUpperCase()} ·{' '}
        {summary.checked === 0
          ? 'NO TELEMETRY AGENTS AT THIS DEPTH'
          : `${summary.ready}/${summary.checked} FULLY FED · ${summary.partial.length} PARTIAL · ${summary.blocked.length} WITH NOTHING`}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 300px) 1fr', gap: 18, alignItems: 'start' }}>
        <ul aria-label="Agent team" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 7 }}>
          {AGENTS.map((a) => {
            const read = roster[a.id]
            const on = a.id === activeId
            const inTier = tierRuns(tier, a.id)
            return (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => setActiveId(a.id)}
                  aria-pressed={on}
                  style={{
                    width: '100%', textAlign: 'left', display: 'flex', gap: 10, alignItems: 'center',
                    background: on ? C.pinkBg : C.panel,
                    border: `1px solid ${on ? C.pinkBd : C.line}`,
                    borderRadius: 8, padding: '10px 12px', cursor: 'pointer',
                    fontFamily: font.ui,
                    // Dimmed, not hidden: a driver choosing a depth should see
                    // what that choice costs them, not watch agents vanish.
                    opacity: inTier ? 1 : 0.5,
                  }}
                >
                  <span style={{ ...MONO_LABEL, color: on ? C.pink : C.dim, border: `1px solid ${on ? C.pinkBd : C.line}`, borderRadius: 4, padding: '3px 5px' }}>
                    {a.code}
                  </span>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: C.silver3 }}>{a.name}</span>
                    <span style={{ display: 'block', fontSize: 10.5, color: C.dim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {a.purpose}
                    </span>
                  </span>
                  <Dot state={read.state} />
                </button>
              </li>
            )
          })}
        </ul>

        <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, padding: '18px 20px' }}>
          <AgentDetail agent={active} read={roster[active.id]} session={detail} inTier={tierRuns(tier, active.id)} />
        </div>
      </div>
    </div>
  )
}
