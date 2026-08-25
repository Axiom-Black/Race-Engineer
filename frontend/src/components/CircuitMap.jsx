// ByteCraft Racing — the track map, with corners named.
//
// WHY IT CHANGED. The previous map coloured the trace by speed and stopped
// there. The owner's verdict was exact: "it's just a gradient map". A gradient
// says where the car was fast; it does not answer the question a driver
// actually has, which is "what did I carry through that corner, and in what
// gear". Ported from prototypes/ByteCraft_SessionReport.jsx, whose map draws
// the circuit as a plain road and puts the data in badges beside each corner —
// speed lives in the plots below, where it can be read against distance.
import { useMemo } from 'react'
import { C, font } from '../theme'
import { gpsPoints, project, nearestPointIndex } from '../lib/trackMap'
import { detectCorners, topSpeedIndex, relaxLabels } from '../lib/corners'

const CHIP_W = 104
const CHIP_H = 28
const BADGE_R = 14
const LEADER = 54

export default function CircuitMap({ pts, aspect, cursor, onScrub }) {
  const withGps = gpsPoints(pts)
  // `aspect` as persisted by ingest.js is lonSpan / latSpan — WIDTH over
  // HEIGHT. Every consumer had been computing `height = width * aspect`, which
  // needs the reciprocal, so every track map ever rendered was stretched into
  // portrait: COTA's true ratio is 0.581 (landscape) and it was drawn at 1.72.
  // Fixed here rather than in ingest so sessions already in Storage render
  // correctly without a re-upload.
  const geom = useMemo(() => {
    const width = 1200
    const wOverH = Number(aspect)
    const height = Number.isFinite(wOverH) && wOverH > 0 ? Math.round(width / wOverH) : width
    return { width, height, pad: 90 }
  }, [aspect])

  const corners = useMemo(() => detectCorners(pts), [pts])
  const topIdx = useMemo(() => topSpeedIndex(pts), [pts])

  // Badge placement: offset along the outward normal, then relaxed apart. Done
  // in one memo because relaxation is O(n^2) per pass and must not re-run on
  // every cursor move.
  const badges = useMemo(() => {
    const seeded = corners.map((c) => {
      const p = pts[c.apexIdx]
      const a = project(p, geom)
      return {
        ...c,
        ax: a.x,
        ay: a.y,
        bx: a.x + c.nx * LEADER,
        by: a.y + c.ny * LEADER,
      }
    })
    return relaxLabels(seeded, { chipW: CHIP_W, chipH: CHIP_H, width: geom.width, height: geom.height })
  }, [corners, pts, geom])

  if (withGps.length < 3) {
    return <div style={{ color: C.dim, fontSize: 12, padding: 20 }}>No GPS trace for this lap.</div>
  }

  const at = (p) => project(p, geom)
  const path = withGps.map((p) => { const q = at(p); return `${q.x.toFixed(1)},${q.y.toFixed(1)}` }).join(' ')
  const cur = pts[Math.min(cursor, pts.length - 1)]
  const start = withGps[0]
  const top = topIdx == null ? null : pts[topIdx]

  function handleMove(e) {
    if (!onScrub) return
    const box = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - box.left) / box.width) * geom.width
    const y = ((e.clientY - box.top) / box.height) * geom.height
    const i = nearestPointIndex(pts, x, y, geom)
    if (i !== null) onScrub(i)
  }

  return (
    <svg
      viewBox={`0 0 ${geom.width} ${geom.height}`}
      role="img"
      aria-label="Track map"
      onMouseMove={handleMove}
      style={{ width: '100%', display: 'block', cursor: onScrub ? 'crosshair' : 'default' }}
    >
      {/* The circuit as a road: a dark edge with a lighter surface. Deliberately
          NOT speed-coloured — the badges and the plots below carry the data,
          and a rainbow under a label makes both harder to read. */}
      <polyline points={path} fill="none" stroke="#1A1D21" strokeWidth="13" strokeLinejoin="round" strokeLinecap="round" />
      <polyline points={path} fill="none" stroke="#3A4046" strokeWidth="8" strokeLinejoin="round" strokeLinecap="round" />

      {/* Start/finish: chequered, with direction, so the lap has an origin. */}
      <g transform={`translate(${at(start).x},${at(start).y})`}>
        {[0, 1, 2, 3].map((i) =>
          [0, 1].map((j) => (
            <rect key={`${i}${j}`} x={-8 + i * 4} y={-4 + j * 4} width="4" height="4"
                  fill={(i + j) % 2 ? '#0A0A0C' : '#E8EAED'} />
          )),
        )}
        <rect x="-8" y="-4" width="16" height="8" fill="none" stroke="#E8EAED" strokeWidth="1" />
        <text x="14" y="-8" fill={C.silver2} fontSize="13" fontWeight="700" letterSpacing="2" fontFamily={font.ui}>
          START ▸
        </text>
      </g>

      {top && (
        <g transform={`translate(${at(top).x},${at(top).y})`}>
          <circle r="7" fill={C.bg} stroke={C.silver3} strokeWidth="2" />
          <circle r="2.5" fill={C.silver3} />
          <text x="12" y="-6" fill={C.dim} fontSize="11" fontWeight="700" letterSpacing="1" fontFamily={font.ui}>
            TOP SPEED {Math.round(Number(top.s))}
          </text>
        </g>
      )}

      {badges.map((b) => (
        <g key={b.n}>
          <line x1={b.ax} y1={b.ay} x2={b.bx} y2={b.by} stroke="#3A4046" strokeWidth="1.5" />
          <circle cx={b.bx} cy={b.by} r={BADGE_R} fill="#2E3338" stroke="#3A4046" strokeWidth="1.5" />
          <text x={b.bx} y={b.by + 5} fill={C.silver3} fontSize="13" fontWeight="800" textAnchor="middle" fontFamily={font.ui}>
            {String(b.n).padStart(2, '0')}
          </text>
          <g transform={`translate(${b.bx + 19},${b.by - CHIP_H / 2})`}>
            <rect width={CHIP_W} height={CHIP_H} rx="8" fill={C.panel2} stroke="#2A2F35" strokeWidth="1" />
            <text x="12" y="19" fill={C.dim} fontSize="10" fontFamily={font.ui}>◔</text>
            <text x="26" y="19" fill={C.silver3} fontSize="13" fontWeight="700" fontFamily={font.mono}>
              {b.minSpeed ?? '—'}
            </text>
            <line x1="64" y1="6" x2="64" y2={CHIP_H - 6} stroke="#2A2F35" strokeWidth="1" />
            <text x="72" y="19" fill={C.dim} fontSize="10" fontFamily={font.ui}>⚙</text>
            <text x="86" y="19" fill={C.silver3} fontSize="13" fontWeight="700" fontFamily={font.mono}>
              {b.gearAtApex ?? '—'}
            </text>
          </g>
        </g>
      ))}

      {cur && cur.x != null && (
        <>
          <circle cx={at(cur).x} cy={at(cur).y} r="12" fill="none" stroke={C.pink} strokeWidth="3" />
          <circle cx={at(cur).x} cy={at(cur).y} r="4.5" fill={C.pink} />
        </>
      )}
    </svg>
  )
}

export { CHIP_W, CHIP_H }
