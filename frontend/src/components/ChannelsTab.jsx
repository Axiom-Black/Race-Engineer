// ByteCraft Racing — the Channels tab: every decoded channel, nothing else.
//
// WHY IT IS ITS OWN TAB. The inventory used to sit at the bottom of Summary,
// below the session header, the flags and the full lap table. On a real LMU
// export that is 70 rows a driver has to scroll past everything else to reach,
// with no way to find one by name. Promoting it makes Summary shorter AND
// makes the inventory usable — a search box is only worth having once the
// thing being searched is the whole page.
//
// The honesty bar is the point of this view, not a footnote to it: known-empty
// and unreliable channels are listed and badged, never dropped
// (WORKING_PLAN §4). A driver who cannot find "Tyre Load FL" would reasonably
// conclude the parser missed it; seeing it flagged EMPTY tells the truth,
// which is that LMU's GTE export carries the channel and never fills it.
import { useMemo, useState } from 'react'
import { C, font } from '../theme'
import { useUnits } from '../lib/useUnits'
import { domainsOf, filterChannels, channelStats, formatRange, formatRate } from '../lib/channels'

const DOMAIN_COLOR = {
  Telemetry: C.pink, Tire: C.warn, Brakes: C.orange, Aero: C.blue,
  Powertrain: C.good, Environment: C.silver2, GPS: C.dim, Session: C.dim,
}

function Badge({ kind, children }) {
  const col = kind === 'empty' ? C.warn : C.danger
  return (
    <span
      style={{
        fontSize: 8.5, letterSpacing: 0.8, fontWeight: 700, color: col,
        border: `1px solid ${col}55`, borderRadius: 4, padding: '1px 5px', marginLeft: 6,
      }}
    >
      {children}
    </span>
  )
}

export default function ChannelsTab({ channels }) {
  const { system } = useUnits()
  const [domain, setDomain] = useState('All')
  const [query, setQuery] = useState('')

  const domains = useMemo(() => domainsOf(channels), [channels])
  const shown = useMemo(() => filterChannels(channels, { domain, query }), [channels, domain, query])
  const stats = useMemo(() => channelStats(channels), [channels])

  return (
    <>
      <div
        style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
          flexWrap: 'wrap', gap: 10, marginBottom: 4,
        }}
      >
        <h2 style={{ color: C.silver3, fontSize: 15, fontWeight: 700, margin: 0 }}>
          Channel inventory · {stats.total}{' '}
          <span style={{ color: C.dim, fontWeight: 400, fontSize: 12 }}>
            ({stats.flagged} flagged)
          </span>
        </h2>
        <span style={{ fontSize: 11.5, color: C.dim }}>
          Showing {shown.length} of {stats.total}
        </span>
      </div>

      <p style={{ color: C.dim, fontSize: 12, margin: '0 0 12px', maxWidth: 640, lineHeight: 1.55 }}>
        Every decoded channel, honestly — known-empty and unreliable channels are flagged, never
        hidden. Empty channels are LMU's export, not a parser fault.
      </p>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a channel…"
          aria-label="Find a channel"
          style={{
            background: C.panel2, border: `1px solid ${C.line}`, borderRadius: 7,
            padding: '7px 11px', color: C.silver3, fontSize: 12.5, fontFamily: font.ui,
            minWidth: 190, outline: 'none',
          }}
        />
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {domains.map((d) => (
            <button
              key={d}
              onClick={() => setDomain(d)}
              aria-pressed={domain === d}
              style={{
                cursor: 'pointer', fontSize: 9, fontWeight: 700, letterSpacing: 0.5,
                padding: '4px 9px', borderRadius: 5, fontFamily: font.ui,
                color: domain === d ? '#0A0A0C' : DOMAIN_COLOR[d] || C.dim,
                background: domain === d ? DOMAIN_COLOR[d] || C.pink : 'transparent',
                border: `1px solid ${domain === d ? 'transparent' : C.line}`,
              }}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <div
          style={{
            border: `1px dashed ${C.line}`, borderRadius: 8, padding: '26px 18px',
            textAlign: 'center', color: C.dim, fontSize: 13,
          }}
        >
          No channel matches {query.trim() ? `“${query.trim()}”` : 'this filter'}
          {domain !== 'All' ? ` in ${domain}` : ''}.
        </div>
      ) : (
        <div style={{ border: `1px solid ${C.line}`, borderRadius: 8, overflow: 'hidden' }}>
          {shown.map((c) => {
            const range = formatRange(c, system)
            const rate = formatRate(c)
            return (
              <div
                key={c.name}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  gap: 12, padding: '7px 14px', borderBottom: `1px solid ${C.line}`, fontSize: 12,
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 7, color: C.silver2, minWidth: 0 }}>
                  <span
                    style={{
                      width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
                      background: DOMAIN_COLOR[c.domain] || C.dim,
                    }}
                  />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span>
                  {c.allZero && <Badge kind="empty">EMPTY</Badge>}
                  {c.reliable === false && <Badge kind="unreliable">UNRELIABLE</Badge>}
                </span>
                <span
                  style={{
                    color: C.dim, fontFamily: font.mono, whiteSpace: 'nowrap',
                    display: 'flex', gap: 12,
                  }}
                >
                  {rate && <span style={{ color: C.faint ?? C.dim, opacity: 0.75 }}>{rate}</span>}
                  <span>{range ?? '—'}</span>
                </span>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
