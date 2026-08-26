// @vitest-environment jsdom
//
// The stint maths is covered in lib/runs.test.js. This covers what the VIEW
// does with the answer — and specifically with the absence of one. On the
// pilot's own fixture the longest stint is three laps, so the 5, 7 and 10-lap
// figures legitimately have nothing to report. Four identical dashes read as a
// broken panel; the reason is what makes them an answer.
import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import SessionRuns from './SessionRuns.jsx'

const SESSION = { fastest_lap_no: 2, fastest_lap_s: 135.475 }

const lap = (no, t, kind = 'timed') => ({
  lap_no: no,
  lap_time_s: t,
  valid: kind === 'timed',
  summary: { kind },
})

// The pilot fixture's shape: an out-lap, three timed laps, a trailing partial.
const SHORT = [
  lap(0, null, 'out'),
  lap(1, 138.78),
  lap(2, 135.5),
  lap(3, 136.2),
  lap(4, null, 'partial'),
]

// Two stints of five, split by a pit stop that leaves a gap in lap numbering.
const LONG = [
  lap(0, null, 'out'),
  ...[1, 2, 3, 4, 5].map((n) => lap(n, 140 - n * 0.1)),
  ...[9, 10, 11, 12, 13].map((n) => lap(n, 138 - n * 0.1)),
]

describe('run averages', () => {
  it('reports the best 3, 5, 7 and 10-lap averages', () => {
    render(<SessionRuns session={{}} laps={LONG} />)
    for (const n of [3, 5, 7, 10]) {
      expect(screen.getByText(`BEST ${n}-LAP AVG`)).toBeInTheDocument()
    }
  })

  it('names the laps a reported average was taken from', () => {
    // Without the window, "1:37.900" is a number a driver cannot check.
    render(<SessionRuns session={{}} laps={LONG} />)
    // Both the 5-lap average cell and the stint chip name the same window —
    // which is the point: the figure and its provenance agree.
    expect(screen.getAllByText(/laps 9–13/).length).toBeGreaterThanOrEqual(1)
  })

  it('explains an absent figure instead of printing a bare dash', () => {
    render(<SessionRuns session={SESSION} laps={SHORT} />)
    expect(screen.getByText(/needs 5 consecutive laps; longest stint was 3/)).toBeInTheDocument()
    expect(screen.getByText(/needs 10 consecutive laps; longest stint was 3/)).toBeInTheDocument()
  })

  it('never approximates a longer window downward', () => {
    // "Best five-lap average" means five laps in a row. Falling back to the
    // best three would answer a different question in the same box.
    render(<SessionRuns session={SESSION} laps={SHORT} />)
    const cells = screen.getAllByText('—')
    expect(cells).toHaveLength(3) // 5, 7 and 10 — only the 3-lap figure exists
  })

  it('will not average across a pit stop', () => {
    // Two stints of five with a gap in lap numbering between them: there are
    // ten timed laps and no ten-lap run.
    render(<SessionRuns session={{}} laps={LONG} />)
    expect(screen.getByText(/needs 10 consecutive laps; longest stint was 5/)).toBeInTheDocument()
  })
})

describe('the stint strip', () => {
  it('shows each stint, so "longest stint was 3" is checkable', () => {
    render(<SessionRuns session={{}} laps={LONG} />)
    const stints = within(screen.getByRole('list', { name: 'Stints in this session' }))
    expect(stints.getAllByRole('listitem')).toHaveLength(2)
    expect(stints.getByText(/STINT 1 · 5 LAPS/)).toBeInTheDocument()
  })
})

describe('lap by lap', () => {
  it('lists every timed lap and marks the quickest', () => {
    render(<SessionRuns session={SESSION} laps={SHORT} />)
    const laps = within(screen.getByRole('list', { name: 'Lap times' }))
    expect(laps.getAllByRole('listitem')).toHaveLength(3) // out-lap and partial excluded
    expect(laps.getByText('L2')).toBeInTheDocument()
  })

  it('shows the RECONCILED time for the fastest lap', () => {
    // The .ldx says 2:15.475; the .ld trace says 2:15.500. Showing the trace
    // time here would contradict the headline directly above it.
    render(<SessionRuns session={SESSION} laps={SHORT} />)
    const laps = within(screen.getByRole('list', { name: 'Lap times' }))
    expect(laps.getByText('2:15.475')).toBeInTheDocument()
    expect(laps.queryByText('2:15.500')).toBeNull()
  })
})

describe('a session with nothing to average', () => {
  it('says why rather than rendering four empty boxes', () => {
    render(<SessionRuns session={{}} laps={[lap(0, null, 'out'), lap(1, null, 'partial')]} />)
    expect(screen.getByText(/No completed laps in this session/)).toBeInTheDocument()
    expect(screen.queryByText('BEST 3-LAP AVG')).toBeNull()
  })

  it('survives a session with no laps at all', () => {
    render(<SessionRuns session={{}} laps={null} />)
    expect(screen.getByText(/No completed laps in this session/)).toBeInTheDocument()
  })
})
