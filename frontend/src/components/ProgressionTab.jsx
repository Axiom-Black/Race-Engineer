// ByteCraft Racing — Progression.
//
// Laid out after prototypes/bytecraft-racing-host.jsx's ProgressionTracker,
// which the owner named as the target: three facet filters, a tier legend that
// doubles as the editor, and one dense row per combination carrying gap, tier,
// sparkline and direction. The previous card stack held the same data and made
// a driver scroll to compare two circuits; a row grid puts them side by side,
// which is the whole question this tab answers.
//
// ONE HONEST DIFFERENCE FROM THE PROTOTYPE, unchanged from the first version of
// this tab: it shows "gap to IDEAL" against a curated reference-lap library.
// That library is a Phase 2+ concept and does not exist, so this shows gap to
// YOUR best — a real, computable number from data that exists. The column is
// labelled for what it actually measures. When the ideal-lap library lands, the
// label and the source change; the layout does not.
//
// The gap is a PERCENTAGE now, not seconds: half a second off at Monaco is a
// different driver from half a second off at Le Mans, and one tier threshold
// cannot mean both. See lib/progression.js.
import { useEffect, useMemo, useState } from 'react'
import { C, font } from '../theme'
import { listSessions } from '../lib/sessions'
import { useAuth } from '../lib/auth'
import FaultNotice from './FaultNotice'
import { loadTiers, saveTiers } from '../lib/prefs'
import {
  ALL,
  DEFAULT_TIERS,
  applyFilters,
  closenessPct,
  fmtGap,
  fmtLap,
  groupCombos,
  minMax,
  optionsOf,
  tierNameFor,
} from '../lib/progression'

// Tier colours live here, not in the domain module — the rollup decides which
// tier a gap falls in; the view decides what that looks like.
const TIER_COLORS = {
  UNRANKED: C.dim,
  ELITE: C.pink,
  COMPETITIVE: '#C77DFF',
  DEVELOPING: C.warn,
  FOUNDATION: C.silver2,
}
const TIER_ORDER = ['ELITE', 'COMPETITIVE', 'DEVELOPING', 'FOUNDATION']
const TIER_KEY = { ELITE: 'elite', COMPETITIVE: 'competitive', DEVELOPING: 'developing' }

const LABEL = { fontSize: 9, color: C.dim, letterSpacing: 1.2, fontWeight: 700, fontFamily: font.mono }

const DIRECTION = {
  improving: { glyph: '▼', text: 'improving', color: C.good },
  slipping: { glyph: '▲', text: 'slipping', color: C.danger },
  holding: { glyph: '▬', text: 'holding', color: C.silver2 },
}

/**
 * The gap series as a line. Lower is better, so the line falls as the driver
 * improves — Y is NOT inverted, which is the one thing to get right here: a
 * rising line would read as progress and mean the opposite.
 */
function Sparkline({ series, color, width = 130, height = 32 }) {
  const points = (series ?? []).filter((v) => Number.isFinite(v))
  if (points.length < 2) {
    return (
      <div style={{ width, height, display: 'flex', alignItems: 'center', fontSize: 10, color: C.dim }}>
        one session
      </div>
    )
  }
  const pad = 3
  const { lo, hi } = minMax(points)
  const range = hi - lo || 1
  const d = points
    .map((p, i) => {
      const x = pad + (i / (points.length - 1)) * (width - pad * 2)
      const y = pad + ((p - lo) / range) * (height - pad * 2)
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  const lastX = width - pad
  const lastY = pad + ((points[points.length - 1] - lo) / range) * (height - pad * 2)
  return (
    <svg width={width} height={height} role="img" aria-label={`Gap trend over ${points.length} sessions`} style={{ display: 'block' }}>
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lastX} cy={lastY} r="3" fill={color} />
    </svg>
  )
}

function Facet({ label, value, options, onChange }) {
  const active = value !== ALL
  return (
    <label style={{ display: 'block' }}>
      <div style={{ ...LABEL, marginBottom: 4 }}>{label.toUpperCase()}</div>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          background: C.panel,
          color: active ? C.silver3 : C.dim,
          border: `1px solid ${active ? C.pink : C.line}`,
          borderRadius: 6,
          padding: '7px 10px',
          fontSize: 12,
          fontFamily: font.ui,
          minWidth: 150,
          cursor: 'pointer',
        }}
      >
        <option value={ALL}>{`All ${label.toLowerCase()}s`}</option>
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </label>
  )
}

export default function ProgressionTab() {
  const { user } = useAuth()
  const [sessions, setSessions] = useState(null)
  const [error, setError] = useState(null)
  const [tiers, setTiers] = useState(DEFAULT_TIERS)
  const [editing, setEditing] = useState(false)
  const [storageWarning, setStorageWarning] = useState(false)
  const [filters, setFilters] = useState({ venue: ALL, carClass: ALL, sessionType: ALL })

  useEffect(() => {
    listSessions().then(setSessions).catch(setError)
  }, [])

  // Thresholds are per driver: re-read whenever the signed-in user changes,
  // so switching accounts in one browser doesn't inherit the other's setup.
  useEffect(() => {
    setTiers(loadTiers(user?.id))
    setStorageWarning(false)
  }, [user?.id])

  function updateTier(key, value) {
    const next = { ...tiers, [key]: Math.max(0, Number(value) || 0) }
    setTiers(next)
    // saveTiers reports a failed write (private browsing, storage disabled)
    // rather than throwing — surface it instead of silently losing the edit.
    setStorageWarning(!saveTiers(user?.id, next))
  }

  const combos = useMemo(() => groupCombos(sessions ?? []), [sessions])
  const shown = useMemo(() => applyFilters(combos, filters), [combos, filters])
  const facets = useMemo(
    () => ({
      venue: optionsOf(combos, 'venue'),
      carClass: optionsOf(combos, 'carClass'),
      sessionType: optionsOf(combos, 'sessionType'),
    }),
    [combos],
  )

  // A filter can outlive the thing it points at (the last session of that car
  // class deleted). Drop it rather than rendering a permanently empty list the
  // driver has no obvious way out of.
  useEffect(() => {
    setFilters((f) => {
      const next = { ...f }
      let changed = false
      for (const key of ['venue', 'carClass', 'sessionType']) {
        if (f[key] !== ALL && !facets[key].includes(f[key])) {
          next[key] = ALL
          changed = true
        }
      }
      return changed ? next : f
    })
  }, [facets])

  if (error) return <FaultNotice error={error} />
  if (sessions === null) return <p style={{ color: C.dim }}>Loading…</p>

  const filtered = Object.values(filters).some((v) => v !== ALL)

  const heading = (
    <h2 style={{ color: C.silver3, fontSize: 18, fontWeight: 900, margin: 0, letterSpacing: '-0.01em' }}>
      Progression
    </h2>
  )

  if (combos.length === 0) {
    return (
      <div>
        {heading}
        <p style={{ color: C.dim, fontSize: 13, maxWidth: 480, lineHeight: 1.6, marginTop: 8 }}>
          Upload at least one session with a fastest-lap time to start tracking progress. Trends
          need two sessions of the same venue, car, and session type.
        </p>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
        {heading}
        <button
          type="button"
          onClick={() => setEditing(!editing)}
          aria-pressed={editing}
          style={{
            background: editing ? C.pinkBg : 'transparent',
            border: `1px solid ${editing ? C.pinkBd : C.line}`,
            color: editing ? C.pink : C.silver2,
            borderRadius: 7, padding: '7px 13px', fontSize: 12, fontWeight: 700,
            fontFamily: font.ui, cursor: 'pointer',
          }}
        >
          {editing ? 'Done' : 'Configure tiers'}
        </button>
      </div>
      <p style={{ color: C.dim, fontSize: 13, margin: '0 0 18px', maxWidth: 620, lineHeight: 1.55 }}>
        Gap to your own best across every class × track × session you have run. Lower is better —
        closing the gap moves you up the tiers. There is no curated ideal-lap library yet, so this
        measures you against you.
      </p>

      <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <Facet label="Track" value={filters.venue} options={facets.venue}
               onChange={(v) => setFilters({ ...filters, venue: v })} />
        <Facet label="Class" value={filters.carClass} options={facets.carClass}
               onChange={(v) => setFilters({ ...filters, carClass: v })} />
        <Facet label="Session" value={filters.sessionType} options={facets.sessionType}
               onChange={(v) => setFilters({ ...filters, sessionType: v })} />
        <div style={{ flex: 1 }} />
        <div style={{ fontFamily: font.mono, fontSize: 11, color: C.dim, paddingBottom: 8 }}>
          {shown.length} of {combos.length} shown
          {filtered && (
            <button
              type="button"
              onClick={() => setFilters({ venue: ALL, carClass: ALL, sessionType: ALL })}
              style={{
                marginLeft: 12, background: 'transparent', border: `1px solid ${C.line}`,
                color: C.silver2, borderRadius: 6, padding: '4px 10px', fontSize: 10,
                fontFamily: font.mono, cursor: 'pointer',
              }}
            >
              CLEAR
            </button>
          )}
        </div>
      </div>

      {/* Tier legend, which becomes the editor rather than opening a second
          surface: the thing you are reading is the thing you adjust. */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        {TIER_ORDER.map((name) => {
          const color = TIER_COLORS[name]
          const key = TIER_KEY[name]
          return (
            <div
              key={name}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                border: `1px solid ${color}55`, background: `${color}12`,
                borderRadius: 8, padding: '7px 12px',
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: 99, background: color }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: C.silver3 }}>
                {name[0] + name.slice(1).toLowerCase()}
              </span>
              {editing && key ? (
                <label style={{ fontFamily: font.mono, fontSize: 11, color: C.dim }}>
                  ≤
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    aria-label={`${name} threshold`}
                    value={tiers[key]}
                    onChange={(e) => updateTier(key, e.target.value)}
                    style={{
                      width: 52, marginLeft: 4, background: C.bg, color: C.silver3,
                      border: `1px solid ${C.line}`, borderRadius: 4, padding: '2px 5px',
                      fontFamily: font.mono, fontSize: 11,
                    }}
                  />
                  %
                </label>
              ) : (
                <span style={{ fontFamily: font.mono, fontSize: 10, color: C.dim }}>
                  {key ? `≤${tiers[key]}%` : 'rest'}
                </span>
              )}
            </div>
          )
        })}
        {editing && (
          <span style={{ fontSize: 10, color: C.dim, fontStyle: 'italic' }}>
            Saved to this browser only.
          </span>
        )}
      </div>
      {storageWarning && (
        <div style={{ fontSize: 10, color: C.warn, marginTop: -12, marginBottom: 14 }}>
          Couldn’t save — browser storage is unavailable, so these reset on reload.
        </div>
      )}

      {/* A list, not a stack of divs: the rows are one enumerable thing, and
          the tier names repeat in the legend above — without a named region
          there is no way to ask for "the tier on the COTA row". */}
      <ul aria-label="Progression by combination"
          style={{ display: 'grid', gap: 10, listStyle: 'none', margin: 0, padding: 0 }}>
        {shown.length === 0 && (
          <li style={{ padding: 26, textAlign: 'center', color: C.dim, border: `1px dashed ${C.line}`, borderRadius: 10, fontSize: 13 }}>
            No sessions match these filters. Clear a filter to see more.
          </li>
        )}
        {shown.map((c) => {
          const tierName = tierNameFor(c.gapPct, tiers, c.count)
          const color = TIER_COLORS[tierName]
          const dir = DIRECTION[c.direction]
          return (
            <li
              key={`${c.venue}|${c.car}|${c.sessionType}`}
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(180px, 1.6fr) minmax(120px, 1fr) 0.8fr 140px minmax(110px, 0.9fr)',
                alignItems: 'center',
                gap: 16,
                background: C.panel,
                border: `1px solid ${C.line}`,
                borderRadius: 10,
                padding: '14px 18px',
              }}
            >
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.silver3 }}>{c.venue}</div>
                <div style={{ fontFamily: font.mono, fontSize: 11, color: C.dim }}>
                  {[c.carClass, c.car, c.sessionType].filter(Boolean).join(' · ')}
                </div>
              </div>

              <div>
                {/* Labelled for what it measures. "GAP TO IDEAL" would be a
                    claim about a reference library that does not exist. */}
                <div style={LABEL}>GAP TO YOUR BEST</div>
                <div style={{ fontFamily: font.mono, fontSize: 18, fontWeight: 800, color }}>
                  {c.gapPct == null ? '—' : `${c.gapPct.toFixed(2)}%`}
                </div>
                <div style={{ fontFamily: font.mono, fontSize: 10, color: C.dim }}>
                  {fmtGap(c.gap)} · best {fmtLap(c.bestEver)}
                </div>
              </div>

              <div
                style={{
                  justifySelf: 'start', fontSize: 11, fontWeight: 700, letterSpacing: 0.6,
                  color, border: `1px solid ${color}66`, background: `${color}14`,
                  borderRadius: 6, padding: '4px 10px',
                }}
              >
                {tierName[0] + tierName.slice(1).toLowerCase()}
              </div>

              <Sparkline series={c.series} color={color} />

              <div style={{ justifySelf: 'end', textAlign: 'right' }}>
                <div style={{ fontFamily: font.mono, fontSize: 11, color: dir ? dir.color : C.dim }}>
                  {dir ? `${dir.glyph} ${dir.text}` : 'no trend yet'}
                </div>
                <div style={{ fontFamily: font.mono, fontSize: 10, color: C.dim, marginTop: 2 }}>
                  {c.count} session{c.count > 1 ? 's' : ''}
                </div>
                <div style={{ height: 4, background: C.line, borderRadius: 2, overflow: 'hidden', marginTop: 6 }}>
                  <div style={{ width: `${closenessPct(c.gapPct, tiers)}%`, height: '100%', background: color, transition: 'width .4s' }} />
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
