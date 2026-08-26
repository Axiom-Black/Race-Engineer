// @vitest-environment jsdom
//
// The first component test in this repo. It covers what logic tests could not:
// that the figures a driver reads first actually REACH the screen, and that a
// stat with no number explains itself rather than showing a bare dash.
//
// Every assertion here corresponds to something the throwaway Playwright
// harness checked by hand on 25 Aug. Turning them into a suite is the point —
// the harness found a real defect (a lap time explaining its absence with
// channel wording) and would have found it again only if someone remembered
// to rebuild it.
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SessionOverview from './SessionOverview.jsx'
import { BUILD } from '../lib/buildInfo.js'

// Fixture extents, from golden_master_ld.json.
const CHANNELS = [
  { name: 'Ground Speed', unit: 'km/h', domain: 'Vehicle', min: 0, max: 245.98, allZero: false, reliable: true },
  { name: 'Fuel Level', unit: 'l', domain: 'Vehicle', min: 79.92, max: 93.0, allZero: false, reliable: true },
  { name: 'Tyre Load FL', unit: 'N', domain: 'Tyres', min: 0, max: 0, allZero: true, reliable: true },
]

const SESSION = {
  venue: 'Circuit of the Americas',
  car: 'Ferrari 488 GTE Evo',
  car_class: 'GTE',
  session_type: 'practice',
  recorded_at: '2026-06-30T19:32:27Z',
  lap_count: 3,
  fastest_lap_no: 2,
  fastest_lap_s: 135.475,
  is_demo: false,
  summary: { channels: CHANNELS },
}

const LAPS = [
  { lap_no: 0, lap_time_s: null, valid: false, summary: { kind: 'out' } },
  { lap_no: 1, lap_time_s: 138.78, valid: true, summary: { kind: 'timed' } },
  { lap_no: 2, lap_time_s: 135.5, valid: true, summary: { kind: 'timed' } },
  { lap_no: 3, lap_time_s: 136.2, valid: true, summary: { kind: 'timed' } },
]

function renderOverview(props = {}) {
  const onOpenReport = vi.fn()
  const onBack = vi.fn()
  render(
    <SessionOverview
      session={SESSION}
      laps={LAPS}
      onOpenReport={onOpenReport}
      onBack={onBack}
      {...props}
    />,
  )
  return { onOpenReport, onBack }
}

describe('a healthy session', () => {
  it('leads with the venue', () => {
    renderOverview()
    expect(screen.getByText('Circuit of the Americas')).toBeInTheDocument()
  })

  it('shows the four headline figures', () => {
    renderOverview()
    expect(screen.getByText('TIMED LAPS')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument() // out-lap excluded
    // Twice now: the headline, and the same lap in the lap-by-lap strip.
    expect(screen.getAllByText('2:15.475').length).toBeGreaterThan(0)
    expect(screen.getByText('246')).toBeInTheDocument() // 245.98 km/h
    expect(screen.getByText('13.1')).toBeInTheDocument() // 93.0 - 79.92 l
  })

  it('shows the .ldx fastest time, not the trace time — everywhere on the page', () => {
    // 2:15.475 (.ldx) rather than 2:15.500 (.ld). The lap-by-lap strip added
    // with the run averages reads the same lap, so it has to reconcile too:
    // 2:15.500 in a chip under a 2:15.475 headline is the overview
    // contradicting itself on one screen.
    renderOverview()
    expect(screen.queryByText('2:15.500')).not.toBeInTheDocument()
    expect(screen.getAllByText('2:15.475')).toHaveLength(2)
  })

  it('raises no flags', () => {
    renderOverview()
    expect(screen.queryAllByRole('alert')).toHaveLength(0)
  })

  it('counts the flagged channel without hiding it from the total', () => {
    renderOverview()
    expect(screen.getByText(/3 channels .* 1 flagged/)).toBeInTheDocument()
  })

  it('opens the report on request', async () => {
    const { onOpenReport } = renderOverview()
    await userEvent.click(screen.getByRole('button', { name: /open report/i }))
    expect(onOpenReport).toHaveBeenCalledOnce()
  })

  it('goes back to the garage on request', async () => {
    const { onBack } = renderOverview()
    await userEvent.click(screen.getByRole('button', { name: /garage/i }))
    expect(onBack).toHaveBeenCalledOnce()
  })
})

describe('a stat with no number explains itself', () => {
  it('says WHY fuel is missing rather than showing 0.0', () => {
    // The defect this closes: "0.0 l used" reads as "I used no fuel", not as
    // "we don't know". A bare dash is only marginally better.
    renderOverview({ session: { ...SESSION, summary: { channels: CHANNELS.slice(0, 1) } } })
    expect(screen.getByText('not in this export')).toBeInTheDocument()
    expect(screen.queryByText('0.0')).not.toBeInTheDocument()
  })

  it('uses lap wording, not channel wording, for a missing fastest lap', () => {
    // Found by the isolation harness, invisible to 19 passing logic tests: a
    // fastest lap is not a channel, so "not in this export" was nonsense.
    renderOverview({ laps: [{ lap_no: 0, lap_time_s: null, valid: false, summary: { kind: 'partial' } }] })
    expect(screen.getByText('no timed lap')).toBeInTheDocument()
  })

  it('refuses to headline an all-zero channel as a real reading', () => {
    const channels = [{ ...CHANNELS[0], allZero: true }, CHANNELS[1]]
    renderOverview({ session: { ...SESSION, summary: { channels } } })
    expect(screen.getByText('channel is empty')).toBeInTheDocument()
    expect(screen.queryByText('246')).not.toBeInTheDocument()
  })
})

describe('a session whose summary and telemetry disagree', () => {
  const laps = [{ lap_no: 0, lap_time_s: null, valid: false, summary: { kind: 'partial' } }]

  it('surfaces both reconciliation flags on the landing view', () => {
    // Deliberately NOT buried a tab deep: an unverified fastest lap is exactly
    // what a driver must see before quoting the number above it.
    renderOverview({ laps })
    const alerts = screen.getAllByRole('alert')
    expect(alerts).toHaveLength(2)
    expect(screen.getByText(/FASTEST LAP UNVERIFIED/)).toBeInTheDocument()
    expect(screen.getByText(/LAP COUNT DISAGREES/)).toBeInTheDocument()
  })

  it('still shows the figures it can stand behind', () => {
    renderOverview({ laps })
    expect(screen.getByText('0')).toBeInTheDocument() // zero timed laps
    expect(screen.getByText('246')).toBeInTheDocument() // top speed is unaffected
  })
})

describe('edge cases', () => {
  it('renders nothing rather than throwing when there is no session', () => {
    const { container } = render(<SessionOverview session={null} laps={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('survives a session with no summary at all', () => {
    expect(() =>
      renderOverview({ session: { ...SESSION, summary: null }, laps: [] }),
    ).not.toThrow()
  })

  it('marks a demo session as one', () => {
    renderOverview({ session: { ...SESSION, is_demo: true } })
    expect(screen.getByText('DEMO')).toBeInTheDocument()
  })
})

describe('the build stamp', () => {
  // Parsing is client-side and derived data is written once, at upload — so a
  // session is permanently shaped by the bundle that ingested it. Establishing
  // that a "14 corners instead of 20" report was a stale record rather than a
  // broken detector took three exchanges on 26 Aug; these make it a glance.
  //
  // Expectations derive from BUILD rather than hard-coding a sha: Vite's
  // `define` applies under the runner, so the value changes every commit.

  const withIngest = (ingest) => ({
    session: { ...SESSION, summary: { ...SESSION.summary, ingest } },
  })

  it('says nothing when the session was parsed by the running build', () => {
    // Silence is the normal case. A badge on every session would train a driver
    // to ignore the one that matters.
    renderOverview(withIngest({ build: BUILD.sha, buildShort: BUILD.short }))
    expect(screen.queryByText(/re-upload to recompute/i)).toBeNull()
  })

  it('flags a session ingested before build stamping existed', () => {
    // Every session already in Storage is in this state. Not an error — "we
    // cannot tell" — and the wording says exactly that rather than crying stale.
    renderOverview(withIngest(undefined))
    expect(screen.getByText(/Parsed before build stamping/i)).toBeInTheDocument()
    expect(screen.queryByText(/an earlier build/i)).toBeNull()
  })

  it('flags a session parsed by a genuinely older build, and names it', () => {
    // The case the whole feature exists for: derived data older than the code
    // reading it, where the fix is a re-upload and not a refresh.
    renderOverview(withIngest({ build: '0'.repeat(40), buildShort: '0000000' }))
    if (BUILD.known) {
      expect(screen.getByText(/Parsed by an earlier build \(0000000\)/i)).toBeInTheDocument()
    } else {
      expect(screen.getByText(/Parsed before build stamping/i)).toBeInTheDocument()
    }
  })
})
