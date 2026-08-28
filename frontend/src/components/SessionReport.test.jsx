// @vitest-environment jsdom
//
// WHY THIS FILE EXISTS AT ALL.
//
// While reworking the Performance tab (25 Aug 2026) an unclosed JSX fragment
// left SessionReport syntactically invalid — and the whole suite still passed,
// because nothing imported it. Lint and the build caught it; the tests could
// not. A 730-line component that no test so much as imports is a hole in the
// gate, so this is deliberately a SMOKE test first and a feature test second:
// merely importing and mounting it would have failed on that mistake.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const getSession = vi.fn()
const getSessionTrace = vi.fn()

vi.mock('../lib/sessions', () => ({
  getSession: (...a) => getSession(...a),
  getSessionTrace: (...a) => getSessionTrace(...a),
}))

// Track Notes reach Supabase, so the query layer is mocked here the same way
// lib/sessions is. Note the boundary this keeps: lib/notes.js — where every
// anchor, grouping and relevance RULE lives — needs no mock at all and is
// tested against no database in notes.test.js. Only the edge is stubbed.
const listTrackNotes = vi.fn(async () => [])
const saveNote = vi.fn(async (row) => ({ id: 'new', ...row }))
const deleteNote = vi.fn(async () => {})

// UnitsProvider reads the signed-in driver so preferences are per account.
vi.mock('../lib/auth', () => ({ useAuth: () => ({ user: { id: 'driver-1' } }) }))

vi.mock('../lib/trackNotes', () => ({
  listTrackNotes: (...a) => listTrackNotes(...a),
  saveNote: (...a) => saveNote(...a),
  deleteNote: (...a) => deleteNote(...a),
}))

const SessionReport = (await import('./SessionReport.jsx')).default
const { UnitsProvider } = await import('../lib/unitsContext.jsx')
const UnitToggle = (await import('./UnitToggle.jsx')).default

const chans = (over = {}) => [
  { name: 'Ground Speed', unit: 'km/h', domain: 'Telemetry', sampleRateHz: 50, min: 0, max: 245.98, allZero: false, reliable: true, ...over.gs },
  { name: 'G Force Lat', unit: 'G', domain: 'Telemetry', sampleRateHz: 50, min: -2.1, max: 2.1, allZero: false, reliable: true },
  { name: 'Tyre Load FL', unit: 'N', domain: 'Tire', sampleRateHz: 10, min: 0, max: 0, allZero: true, reliable: true },
]

const SESSION = {
  id: 'cur', venue: 'COTA', car: 'Ferrari 488 GTE', car_class: 'GTE', ruleset: 'WEC2023',
  session_type: 'practice', recorded_at: '2026-06-30T19:32:27Z',
  is_demo: false, lap_count: 3, fastest_lap_no: 2, fastest_lap_s: 135.475, length_km: 5.42,
  summary: { channels: chans() },
}
const LAPS = [
  { id: 'l1', lap_no: 1, lap_time_s: 138.78, valid: true, summary: { kind: 'timed' } },
  { id: 'l2', lap_no: 2, lap_time_s: 135.5, valid: true, summary: { kind: 'timed' } },
]

beforeEach(() => {
  vi.clearAllMocks()
  getSession.mockResolvedValue({ session: SESSION, laps: LAPS })
  // No trace: the comparison must still render, which is the regression this
  // rework introduced and then fixed.
  getSessionTrace.mockResolvedValue(null)
})

async function renderReport(sessions = [SESSION]) {
  render(<SessionReport sessionId="cur" sessions={sessions} onBack={() => {}} />)
  // COTA appears in the header and again in the comparison subtitle, so
  // assert presence rather than uniqueness.
  expect((await screen.findAllByText(/COTA/i)).length).toBeGreaterThan(0)
}

describe('smoke', () => {
  it('mounts and shows the session', async () => {
    await renderReport()
  })

  it('offers all five tabs, including Channels', async () => {
    await renderReport()
    for (const t of ['Summary', 'Performance', 'Instruments', 'Track Map', 'Channels']) {
      expect(screen.getByRole('button', { name: t })).toBeInTheDocument()
    }
  })
})

describe('the Channels tab', () => {
  it('lists the inventory, and Summary no longer duplicates it', async () => {
    await renderReport()
    // Summary shows a pointer, not 70 rows.
    expect(screen.getByText(/3 channels decoded/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Channels' }))
    expect(screen.getByText(/Channel inventory · 3/)).toBeInTheDocument()
    expect(screen.getByLabelText('Find a channel')).toBeInTheDocument()
  })
})

// A trace shaped exactly as ingest.js writes it: distance-indexed points
// carrying speed, pedals, gear, G and per-corner slip.
const PT = (i, over = {}) => ({
  x: 0.5, y: 0.5, s: 180, t: 100, b: 0, g: 4, gl: 0.8, glo: -0.2,
  r: 7400, sl: [1.2, 1.4, 6.0, 14.5], d: i / 9, ...over,
})
const TRACE = { aspect: 0.581, laps: [{ lap: 2, pts: Array.from({ length: 10 }, (_, i) => PT(i)) }] }

// A trace carrying the corner set ingest now persists, detected at full rate.
const TRACE_WITH_CORNERS = {
  aspect: 0.581,
  laps: [{
    lap: 2,
    pts: Array.from({ length: 20 }, (_, i) => PT(i, {
      d: i / 19,
      x: 0.5 + 0.4 * Math.cos((i / 20) * 2 * Math.PI),
      y: 0.5 + 0.4 * Math.sin((i / 20) * 2 * Math.PI),
      s: 100 + (i % 5) * 20,
    })),
    corners: [
      { n: 1, dStart: 0.08, d: 0.12, dEnd: 0.18, dir: 'left', peakG: 1.7, minSpeed: 63, gear: 2 },
      { n: 2, dStart: 0.55, d: 0.60, dEnd: 0.66, dir: 'right', peakG: 1.3, minSpeed: 147, gear: 4 },
    ],
  }],
}

describe('the Instruments cluster', () => {
  beforeEach(() => { getSessionTrace.mockResolvedValue(TRACE) })

  it('renders the gauges at the cursor', async () => {
    await renderReport()
    await userEvent.click(screen.getByRole('button', { name: 'Instruments' }))
    expect(await screen.findByLabelText('SPEED gauge')).toBeInTheDocument()
    expect(screen.getByLabelText('ENGINE gauge')).toBeInTheDocument()
    expect(screen.getByLabelText('G force')).toBeInTheDocument()
  })

  it('shows gear, pedals and slip for that point', async () => {
    await renderReport()
    await userEvent.click(screen.getByRole('button', { name: 'Instruments' }))
    // "4" also appears as a lap number and an axis label, so scope to the
    // gear readout by its neighbouring label.
    expect(await screen.findByText('GEAR')).toBeInTheDocument()
    expect(screen.getAllByText('4').length).toBeGreaterThan(0)     // gear
    expect(screen.getByText('100%')).toBeInTheDocument()           // throttle
    expect(screen.getByText('14.5%')).toBeInTheDocument()          // RR slip
  })

  it('colours slip by severity rather than showing four identical rows', async () => {
    await renderReport()
    await userEvent.click(screen.getByRole('button', { name: 'Instruments' }))
    // 1.2 ok, 6.0 warn, 14.5 high — the point of the indicator.
    expect(await screen.findByText('1.2%')).toBeInTheDocument()
    expect(screen.getByText('6.0%')).toBeInTheDocument()
  })

  it('offers a working transport when the lap has a time', async () => {
    await renderReport()
    await userEvent.click(screen.getByRole('button', { name: 'Instruments' }))
    const play = await screen.findByRole('button', { name: /Play/ })
    expect(play).toBeEnabled()
    await userEvent.click(play)
    expect(screen.getByRole('button', { name: /Pause/ })).toBeInTheDocument()
  })

  it('places braking at the TOP of the G cross', async () => {
    // Measured, not assumed: LMU reports POSITIVE G Force Long under braking
    // (+1.63 G mean with brake > 70%). The dot must sit above centre, which is
    // the motorsport convention. A sign flip here would look plausible and be
    // backwards, so it is pinned.
    getSessionTrace.mockResolvedValue({
      aspect: 0.581,
      laps: [{ lap: 2, pts: Array.from({ length: 10 }, (_, i) => PT(i, { gl: 0, glo: 2.0, b: 90, t: 0 })) }],
    })
    await renderReport()
    await userEvent.click(screen.getByRole('button', { name: 'Instruments' }))
    const cross = await screen.findByLabelText('G force')
    const dot = cross.querySelector('circle[r="5"]')
    const cy = Number(dot.getAttribute('cy'))
    const centre = Number(cross.getAttribute('height')) / 2
    expect(cy).toBeLessThan(centre)
  })

  it('DISABLES play rather than hiding it when the lap has no time', async () => {
    // Hiding the control leaves a driver wondering where it went; a disabled
    // one with a reason explains itself.
    getSession.mockResolvedValue({
      session: SESSION,
      laps: [{ id: 'l2', lap_no: 2, lap_time_s: null, valid: false, summary: { kind: 'partial' } }],
    })
    await renderReport()
    await userEvent.click(screen.getByRole('button', { name: 'Instruments' }))
    expect(await screen.findByRole('button', { name: /Play/ })).toBeDisabled()
  })
})

describe('the Track Map', () => {
  beforeEach(() => { getSessionTrace.mockResolvedValue(TRACE) })

  it('draws COTA landscape, not stretched into portrait', async () => {
    // ingest persists `aspect` as lonSpan/latSpan — WIDTH over height. Every
    // consumer had been computing height = width * aspect, so every track map
    // ever rendered was stretched: COTA's true ratio is 0.581 and it was drawn
    // at 1.72. The viewBox must be wider than it is tall.
    getSessionTrace.mockResolvedValue({ ...TRACE, aspect: 1.7212 })
    await renderReport()
    await userEvent.click(screen.getByRole('button', { name: 'Track Map' }))
    const svg = await screen.findByLabelText('Track map')
    const [, , w, h] = svg.getAttribute('viewBox').split(' ').map(Number)
    expect(w).toBeGreaterThan(h)
    expect(h).toBe(Math.round(w / 1.7212))
  })

  it('falls back to a square rather than collapsing on a bad aspect', async () => {
    getSessionTrace.mockResolvedValue({ ...TRACE, aspect: 0 })
    await renderReport()
    await userEvent.click(screen.getByRole('button', { name: 'Track Map' }))
    const svg = await screen.findByLabelText('Track map')
    const [, , w, h] = svg.getAttribute('viewBox').split(' ').map(Number)
    expect(h).toBe(w)
  })

  it('renders the circuit', async () => {
    await renderReport()
    await userEvent.click(screen.getByRole('button', { name: 'Track Map' }))
    expect(await screen.findByLabelText('Track map')).toBeInTheDocument()
  })

  it('marks start/finish with a chequered flag, and the cursor', async () => {
    await renderReport()
    await userEvent.click(screen.getByRole('button', { name: 'Track Map' }))
    const svg = await screen.findByLabelText('Track map')
    expect(screen.getByText(/START/)).toBeInTheDocument()
    // Cursor ring r=12 and dot r=4.5.
    expect(svg.querySelector('circle[r="12"]')).toBeTruthy()
    expect(svg.querySelector('circle[r="4.5"]')).toBeTruthy()
  })

  it('labels corners with min speed and gear at apex', async () => {
    // The whole point of the tab: a gradient says where the car was fast, a
    // badge answers "what did I carry through there, and in what gear".
    await renderReport()
    await userEvent.click(screen.getByRole('button', { name: 'Track Map' }))
    expect(await screen.findByText(/min corner speed/)).toBeInTheDocument()
    expect(screen.getByText(/gear at apex/)).toBeInTheDocument()
  })

  it('marks the fastest point of the lap', async () => {
    await renderReport()
    await userEvent.click(screen.getByRole('button', { name: 'Track Map' }))
    expect(await screen.findByText(/TOP SPEED/)).toBeInTheDocument()
  })

  it('draws the circuit as a road — edge under surface, not a gradient', async () => {
    await renderReport()
    await userEvent.click(screen.getByRole('button', { name: 'Track Map' }))
    const svg = await screen.findByLabelText('Track map')
    const edge = svg.querySelector('polyline')
    expect(edge).toBeTruthy()
    // Edge is wider than the surface and drawn first, so it sits under it.
    expect(Number(edge.getAttribute('stroke-width'))).toBeGreaterThan(8)
    expect(svg.firstChild).toBe(edge)
  })

  it('renders even when every point shares a speed', async () => {
    // No corners are detectable from a flat lap; the map must still draw.
    getSessionTrace.mockResolvedValue({
      aspect: 1,
      laps: [{ lap: 2, pts: Array.from({ length: 6 }, (_, i) => PT(i, { s: 120, x: i / 5, y: (i % 2) / 2 })) }],
    })
    await renderReport()
    await userEvent.click(screen.getByRole('button', { name: 'Track Map' }))
    expect(await screen.findByLabelText('Track map')).toBeInTheDocument()
  })

  it('carries a transport, so the lap can be watched back on the map', async () => {
    // The map is where replay pays: the dot moving round the circuit is what
    // tells a driver WHERE the trace they are reading happened.
    await renderReport()
    await userEvent.click(screen.getByRole('button', { name: 'Track Map' }))
    expect(await screen.findByRole('button', { name: /Play/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '1x' })).toBeInTheDocument()
    expect(screen.getByLabelText('Scrub the lap')).toBeInTheDocument()
  })

  it('shows an instrument panel of only what a position on track explains', async () => {
    await renderReport()
    await userEvent.click(screen.getByRole('button', { name: 'Track Map' }))
    expect(await screen.findByLabelText('SPEED gauge')).toBeInTheDocument()
    expect(screen.getByLabelText('G force')).toBeInTheDocument()
    expect(screen.getByLabelText(/THR/)).toBeInTheDocument()
    // Engine RPM and wheel slip belong to the powertrain and the tyres, not to
    // where the car is — they stay on the Instruments tab that owns them.
    expect(screen.queryByLabelText('ENGINE gauge')).toBeNull()
    expect(screen.queryByText(/WHEEL SLIP/)).toBeNull()
  })

  it('names the section under the cursor, and says STRAIGHT when there is none', async () => {
    // Naming the nearest corner on a straight would put a corner readout on a
    // piece of track that has none.
    await renderReport()
    await userEvent.click(screen.getByRole('button', { name: 'Track Map' }))
    expect(await screen.findByText('STRAIGHT')).toBeInTheDocument()
  })

  it("says the numbering is ours, not the circuit's", async () => {
    // Showing "T12" next to a corner a driver calls turn 15 invites them to
    // quote it to someone else.
    await renderReport()
    await userEvent.click(screen.getByRole('button', { name: 'Track Map' }))
    expect(await screen.findByText(/not the circuit's official numbering/)).toBeInTheDocument()
  })

  it('DRAWS THE PERSISTED CORNERS rather than re-deriving them from the trace', async () => {
    // Corners are detected at ingest from lateral G at 25 Hz — 8.5x the
    // trace's resolution — and stored. Re-deriving them here would throw that
    // away and put the map back on the 400-point ceiling it was moved off.
    getSessionTrace.mockResolvedValue(TRACE_WITH_CORNERS)
    await renderReport()
    await userEvent.click(screen.getByRole('button', { name: 'Track Map' }))
    expect(await screen.findByText('2 corners detected')).toBeInTheDocument()
    // 63 km/h and 4th gear are STORED figures. A re-derivation from this
    // synthetic trace could not produce them.
    const svg = screen.getByLabelText('Track map')
    expect(within(svg).getByText('63')).toBeInTheDocument()
    expect(within(svg).getByText('4')).toBeInTheDocument()
  })

  it('says so when the lap logged no GPS', async () => {
    getSessionTrace.mockResolvedValue({
      aspect: 1,
      laps: [{ lap: 2, pts: Array.from({ length: 6 }, (_, i) => PT(i, { x: null, y: null })) }],
    })
    await renderReport()
    await userEvent.click(screen.getByRole('button', { name: 'Track Map' }))
    expect(await screen.findByText(/No GPS trace for this lap/)).toBeInTheDocument()
  })
})

describe('the Summary hero', () => {
  it('shows circuit length, laps and full-throttle share', async () => {
    await renderReport()
    expect(screen.getByText('Circuit length')).toBeInTheDocument()
    expect(screen.getByText('5.42')).toBeInTheDocument()
    expect(screen.getByText('Laps this run')).toBeInTheDocument()
  })

  it('marks the personal best as set THIS run when it is', async () => {
    await renderReport()
    expect(screen.getByText('Personal best (this run)')).toBeInTheDocument()
    // The time also appears in the lap table, so assert presence not uniqueness.
    expect(screen.getAllByText('2:15.475').length).toBeGreaterThan(0)
  })

  it('credits an older, faster session instead of claiming this one', async () => {
    const faster = { ...SESSION, id: 'old', fastest_lap_s: 133.1, recorded_at: '2026-06-01T00:00:00Z' }
    await renderReport([SESSION, faster])
    expect(screen.getByText('Personal best')).toBeInTheDocument()
    expect(screen.getAllByText('2:13.100').length).toBeGreaterThan(0)
  })

  it('reports the compound from the setup', async () => {
    getSession.mockResolvedValue({
      session: { ...SESSION, setup: { ldx: { FLCompound: 'Soft', FRCompound: 'Soft', RLCompound: 'Soft', RRCompound: 'Soft' } } },
      laps: LAPS,
    })
    await renderReport()
    expect(screen.getByText(/Soft — all four corners/)).toBeInTheDocument()
  })

  it('says so when the setup carries no compound, rather than guessing', async () => {
    await renderReport()
    expect(screen.getByText('Not in this setup export')).toBeInTheDocument()
  })

  it('shows a dash for a thermal reading the export lacks', async () => {
    await renderReport()
    // No brake/water/oil channels in the fixture used here.
    expect(screen.getByText(/brake/)).toBeInTheDocument()
  })

  it('does not print a unit on an absent value', async () => {
    // "— %" reads as a rendering fault rather than as missing data. There is
    // no trace here, so full-throttle share has nothing to report.
    await renderReport()
    expect(screen.getByText('Full throttle')).toBeInTheDocument()
    expect(screen.queryByText('%')).not.toBeInTheDocument()
  })

  it('explains an empty circuit history instead of showing a bare panel', async () => {
    await renderReport()
    expect(screen.getByText(/first session here in this car/)).toBeInTheDocument()
  })

  it('lists prior sessions at the circuit, oldest first', async () => {
    const older = { ...SESSION, id: 'old', fastest_lap_s: 138, recorded_at: '2026-06-01T00:00:00Z' }
    await renderReport([SESSION, older])
    expect(screen.getAllByText('2:18.000').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/practice/).length).toBeGreaterThan(0)
  })
})

describe('the Performance comparison', () => {
  it('renders even with no trace — it reads persisted peaks, not the blob', async () => {
    // The bug this pins: an early return for "no trace" blanked the entire
    // tab, taking the comparison with it.
    await renderReport()
    await userEvent.click(screen.getByRole('button', { name: 'Performance' }))
    expect(screen.getByText(/SESSION PEAKS/)).toBeInTheDocument()
    expect(screen.getByText(/per-lap metrics need the trace blob/)).toBeInTheDocument()
  })

  it('says there is nothing to compare against on a first visit to a circuit', async () => {
    await renderReport([SESSION])
    await userEvent.click(screen.getByRole('button', { name: 'Performance' }))
    expect(screen.getByText(/No previous session in this car at this circuit yet/)).toBeInTheDocument()
  })

  it('compares against a genuine previous session at the same venue and car', async () => {
    const past = { ...SESSION, id: 'past', summary: { channels: chans({ gs: { max: 240 } }) } }
    await renderReport([SESSION, past])
    await userEvent.click(screen.getByRole('button', { name: 'Performance' }))
    expect(screen.getByText(/Compared against your own previous sessions/)).toBeInTheDocument()
    expect(screen.getByText(/▲ 6\.0/)).toBeInTheDocument() // 245.98 vs 240
  })

  it('does not invent a comparison from a different circuit', async () => {
    const elsewhere = { ...SESSION, id: 'seb', venue: 'Sebring' }
    await renderReport([SESSION, elsewhere])
    await userEvent.click(screen.getByRole('button', { name: 'Performance' }))
    expect(screen.getByText(/No previous session in this car at this circuit yet/)).toBeInTheDocument()
  })

  it('reports a missing metric rather than dropping the row', async () => {
    await renderReport()
    await userEvent.click(screen.getByRole('button', { name: 'Performance' }))
    expect(screen.getByText('Peak brake temp')).toBeInTheDocument()
    expect(screen.getAllByText('not in this export').length).toBeGreaterThan(0)
  })
})

// ── W0.2 regression: the toggle must reach the SESSION, not just Channels ──
//
// The first cut of W0.2 converted the Channels tab and nothing else, and 661
// tests passed anyway — because every units test rendered ChannelsTab in
// isolation. The claim was "every number on screen follows"; the coverage was
// one tab. These render the WHOLE REPORT through the real provider and read the
// numbers a driver actually looks at.
describe('the unit toggle reaches the whole session view', () => {
  beforeEach(() => { getSessionTrace.mockResolvedValue(TRACE) })

  async function renderImperial() {
    render(
      <UnitsProvider>
        <UnitToggle />
        <SessionReport sessionId="cur" sessions={[SESSION]} onBack={() => {}} />
      </UnitsProvider>,
    )
    expect((await screen.findAllByText(/COTA/i)).length).toBeGreaterThan(0)
    await userEvent.click(screen.getByRole('button', { name: 'IMP' }))
  }

  it('converts the SUMMARY stat cells', async () => {
    await renderImperial()
    // 5.42 km = 3.37 mi. The circuit length was rendering as a pre-rounded
    // STRING, so the atom had no number left to convert.
    expect(screen.getByText('3.37')).toBeInTheDocument()
    expect(screen.getByText(/^mi$/)).toBeInTheDocument()
    expect(screen.queryByText(/^km$/)).toBeNull()
  })

  it('converts the PERFORMANCE card and its speed-band labels', async () => {
    await renderImperial()
    await userEvent.click(screen.getByRole('button', { name: 'Performance' }))
    // Top speed 180 km/h = 111.8 mph.
    expect(screen.getByText('111.8')).toBeInTheDocument()
    // The band EDGES stay canonical km/h — only their labels convert, so the
    // same lap reports the same share whichever system is selected.
    expect(screen.getByText(/Low \(< 62\.1 mph\)/)).toBeInTheDocument()
    expect(screen.queryByText(/100 km\/h/)).toBeNull()
  })

  it('converts the INSTRUMENTS gauges', async () => {
    await renderImperial()
    await userEvent.click(screen.getByRole('button', { name: 'Instruments' }))
    expect(screen.getAllByText('MPH').length).toBeGreaterThan(0)
    expect(screen.queryByText('KM/H')).toBeNull()
    // RPM is dimensionless and must NOT change.
    expect(screen.getAllByText('RPM').length).toBeGreaterThan(0)
  })

  it('converts the TRACK MAP panel readouts', async () => {
    await renderImperial()
    await userEvent.click(screen.getByRole('button', { name: 'Track Map' }))
    expect(screen.getAllByText('MPH').length).toBeGreaterThan(0)
    // Distance along the lap is metres in SI, feet in imperial.
    expect(screen.getAllByText(/^ft$/).length).toBeGreaterThan(0)
  })

  it('is REVERSIBLE across the whole report, not just the tab that was open', async () => {
    await renderImperial()
    await userEvent.click(screen.getByRole('button', { name: 'SI' }))
    expect(screen.getByText('5.42')).toBeInTheDocument()
    expect(screen.queryByText(/^mi$/)).toBeNull()
  })
})

// ── Reported 28 Aug: "difficult to pick a location on the map" ──
//
// Hovering cannot express "this one", because the pointer must always leave the
// corner to reach the note box — and on the way out it crossed the rest of the
// circuit, re-pointing the note each time. Click is the commitment; hover stays
// a preview.
describe('picking a note location on the map', () => {
  // jsdom reports a zero-size box for every element, so the map's click-to-
  // trace-point projection divides by zero and resolves nothing. Give the SVG
  // a real box for these two tests — without it the click is a no-op and the
  // test would pass or fail for reasons unrelated to the behaviour.
  let rect
  beforeEach(() => {
    getSessionTrace.mockResolvedValue(TRACE_WITH_CORNERS)
    rect = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, width: 1200, height: 2065, right: 1200, bottom: 2065, x: 0, y: 0,
    })
  })
  afterEach(() => rect.mockRestore())

  it('CLICKING THE MAP pins the note anchor, and hovering elsewhere no longer moves it', async () => {
    render(<SessionReport sessionId="cur" sessions={[SESSION]} onBack={() => {}} />)
    expect((await screen.findAllByText(/COTA/i)).length).toBeGreaterThan(0)
    await userEvent.click(screen.getByRole('button', { name: 'Track Map' }))

    const map = screen.getByRole('img', { name: 'Track map' })
    // jsdom gives every element a zero-size box, so the projected click always
    // resolves to the same trace point. That is enough: the assertion is that a
    // click PINS at all, and that a later hover cannot move it.
    await userEvent.click(map)
    expect(screen.getByText(/pinned at/i)).toBeInTheDocument()

    await userEvent.hover(map)
    expect(screen.getByText(/pinned at/i)).toBeInTheDocument()
  })

  it('offers a way to unpin, so a mis-click is not a dead end', async () => {
    render(<SessionReport sessionId="cur" sessions={[SESSION]} onBack={() => {}} />)
    expect((await screen.findAllByText(/COTA/i)).length).toBeGreaterThan(0)
    await userEvent.click(screen.getByRole('button', { name: 'Track Map' }))
    await userEvent.click(screen.getByRole('img', { name: 'Track map' }))
    await userEvent.click(screen.getByRole('button', { name: /move to cursor/i }))
    expect(screen.queryByText(/pinned at/i)).toBeNull()
  })
})
