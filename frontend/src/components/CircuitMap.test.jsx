// @vitest-environment jsdom
//
// Reported 28 Aug from the live app: *"I'm able to save a note at pinned
// locations everywhere but at the actual labelled Turn."*
//
// THE LABEL IS THE ONE PLACE A DRIVER ACTUALLY AIMS AT. Badges are drawn on a
// leader line 54 px off the racing line and then relaxed apart so they do not
// overlap, which pushes them further still. A click on a badge fell through to
// the map's generic handler, which resolves the nearest TRACE point to the
// pointer — and after relaxation the nearest trace point to a badge is very
// often a different part of the circuit entirely. `nearestPointIndex` has no
// distance threshold, so it always answers, and always plausibly.
//
// So the corner you were pointing at was the one corner you could not pin.
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CircuitMap from './CircuitMap.jsx'

// A ring of points so the projection is well-conditioned, with two corners
// whose apexes sit on opposite sides — far enough apart that pinning the wrong
// one is unambiguous rather than a rounding difference.
const PTS = Array.from({ length: 24 }, (_, i) => ({
  x: 0.5 + 0.4 * Math.cos((i / 24) * 2 * Math.PI),
  y: 0.5 + 0.4 * Math.sin((i / 24) * 2 * Math.PI),
  d: i / 23,
  s: 120,
  g: 3,
}))

const CORNERS = [
  { n: 1, apexIdx: 2, d: 2 / 23, dStart: 0.05, dEnd: 0.12, nx: 1, ny: 0, minSpeed: 80, gearAtApex: 2 },
  { n: 7, apexIdx: 14, d: 14 / 23, dStart: 0.58, dEnd: 0.64, nx: -1, ny: 0, minSpeed: 140, gearAtApex: 4 },
]

function renderMap(props = {}) {
  return render(
    <CircuitMap pts={PTS} corners={CORNERS} aspect={1} cursor={0} {...props} />,
  )
}

describe('the corner badge', () => {
  it('IS CLICKABLE, and pins the corner it labels', async () => {
    const onPick = vi.fn()
    renderMap({ onPick })
    await userEvent.click(screen.getByRole('button', { name: /Note corner 7/i }))
    // The corner's own apex index — resolved from the badge's identity, not by
    // searching for the trace point nearest the pointer. The badge knows which
    // corner it is; asking geometry to rediscover that is what went wrong.
    expect(onPick).toHaveBeenCalledWith(14)
  })

  it('does NOT fall through to the map’s nearest-point handler', async () => {
    // The actual defect. Both handlers firing means the badge pins the corner
    // and then the generic handler immediately re-pins somewhere else — last
    // writer wins, and it is the wrong one.
    const onPick = vi.fn()
    renderMap({ onPick })
    await userEvent.click(screen.getByRole('button', { name: /Note corner 1/i }))
    expect(onPick).toHaveBeenCalledTimes(1)
    expect(onPick).toHaveBeenCalledWith(2)
  })

  it('is reachable from the keyboard, since it is a control now', async () => {
    const onPick = vi.fn()
    renderMap({ onPick })
    const badge = screen.getByRole('button', { name: /Note corner 7/i })
    badge.focus()
    await userEvent.keyboard('{Enter}')
    expect(onPick).toHaveBeenCalledWith(14)
  })

  it('names every detected corner, so each one can be aimed at', () => {
    renderMap({ onPick: vi.fn() })
    expect(screen.getByRole('button', { name: /Note corner 1/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Note corner 7/i })).toBeInTheDocument()
  })

  it('stays inert when the map is not offering picks', () => {
    // A read-only map (no onPick) must not advertise controls that do nothing.
    renderMap()
    expect(screen.queryByRole('button', { name: /Note corner/i })).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// SPEC 001 — the mark on the map lights the same instant the panel shows the
// note. docs/specs/001-note-visibility/spec.md
// ─────────────────────────────────────────────────────────────────────────────
describe('note marks', () => {
  it('LIGHTS THE MARK THE CAR IS AT, and leaves the others alone', () => {
    // `active` is resolved by the caller with `isAtDistance` — the identical
    // predicate the notes panel reads with, so the map and the panel cannot
    // disagree about where the car is. Asserted through the DOM flag because a
    // radius is a rendering choice and the STATE is what must be right.
    const { container } = renderMap({
      noteMarks: [
        { key: 'a', idx: 2, count: 1, active: true },
        { key: 'b', idx: 14, count: 3, active: false },
      ],
    })
    const marks = [...container.querySelectorAll('g[data-active]')]
    expect(marks).toHaveLength(2)
    expect(marks.map((m) => m.getAttribute('data-active'))).toEqual(['true', 'false'])
    // The active one is drawn larger — the visible half of the same fact.
    const r = marks.map((m) => Number(m.querySelector('circle').getAttribute('r')))
    expect(r[0]).toBeGreaterThan(r[1])
  })

  it('draws a stack of several notes as its count', () => {
    const { container } = renderMap({ noteMarks: [{ key: 'b', idx: 14, count: 3, active: false }] })
    expect(container.querySelector('g[data-active] text').textContent).toBe('3')
  })
})
