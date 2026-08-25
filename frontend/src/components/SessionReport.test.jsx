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
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const getSession = vi.fn()
const getSessionTrace = vi.fn()

vi.mock('../lib/sessions', () => ({
  getSession: (...a) => getSession(...a),
  getSessionTrace: (...a) => getSessionTrace(...a),
}))

const SessionReport = (await import('./SessionReport.jsx')).default

const chans = (over = {}) => [
  { name: 'Ground Speed', unit: 'km/h', domain: 'Telemetry', sampleRateHz: 50, min: 0, max: 245.98, allZero: false, reliable: true, ...over.gs },
  { name: 'G Force Lat', unit: 'G', domain: 'Telemetry', sampleRateHz: 50, min: -2.1, max: 2.1, allZero: false, reliable: true },
  { name: 'Tyre Load FL', unit: 'N', domain: 'Tire', sampleRateHz: 10, min: 0, max: 0, allZero: true, reliable: true },
]

const SESSION = {
  id: 'cur', venue: 'COTA', car: 'Ferrari 488 GTE', car_class: 'GTE', ruleset: 'WEC2023',
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
