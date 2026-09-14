// @vitest-environment jsdom
//
// D3 measures how easily a *user* changes something, and notes are the surface
// with the most ways to go quietly wrong. These are the assertions a stopwatch
// cannot make: did the right note show, did the note survive, did the note land
// where the driver put it.
//
// The panel is presentational, so none of this needs a database — the rules
// live in lib/notes.js and the queries in lib/trackNotes.js. That separation is
// the reason this file has no `vi.mock` in it at all.
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TrackNotes from './TrackNotes.jsx'
import { anchorLabel } from '../lib/notes'

const SESSION = {
  id: 's-current',
  venue: 'Circuit of the Americas',
  car: 'Ferrari 499P',
  recorded_at: '2026-08-20T14:00:00Z',
  summary: { channels: [{ name: 'Ambient Temperature', min: 29, max: 30 }] },
}

const CORNERS = [
  { n: 1, dStart: 0.02, d: 0.03, dEnd: 0.05, apexIdx: 5 },
  { n: 5, dStart: 0.12, d: 0.128, dEnd: 0.135, apexIdx: 40 },
]

function note(over = {}) {
  return {
    id: 'n1', d_start: 0.125, d_end: 0.130, body: 'Brake 10 m later.',
    car: 'Ferrari 499P', ambient_c: 29.5, track_c: 39,
    session_key: 's-old', source_session_id: 's-old',
    session_recorded_at: '2026-07-01T12:00:00Z',
    ...over,
  }
}

function renderPanel(props = {}) {
  return render(
    <TrackNotes
      notes={[]}
      session={SESSION}
      corners={CORNERS}
      activeCorner={CORNERS[1]}
      cursorD={0.128}
      lengthKm={5.513}
      onSave={vi.fn()}
      onDelete={vi.fn()}
      {...props}
    />,
  )
}

describe('anchorLabel', () => {
  it('prefers the corner label a driver would recognise', () => {
    expect(anchorLabel({ corner_label: 'T5', d_start: 0.1, d_end: 0.2 })).toBe('T5')
  })

  it('falls back to a distance in km, which is a place a driver can find', () => {
    expect(anchorLabel({ d_start: 0.5, d_end: 0.5 }, 5.513)).toBe('2.76 km')
  })

  it('falls back again to a percentage when the lap length is unknown', () => {
    // Not a fabricated km figure. Without the length there is no distance to
    // quote, and quoting one would be inventing a measurement.
    expect(anchorLabel({ d_start: 0.5, d_end: 0.5 }, null)).toBe('50.0% of lap')
    expect(anchorLabel({ d_start: 0.5, d_end: 0.5 }, 0)).toBe('50.0% of lap')
  })
})

describe('the notes panel', () => {
  it('says out loud that the master is bigger than this session', () => {
    // Otherwise the feature is invisible: the point is that these notes come
    // from every session ever driven here, not from the one on screen.
    renderPanel({ notes: [note(), note({ id: 'n2', d_start: 0.03, d_end: 0.03 })] })
    expect(screen.getByText(/2 notes across every session you have driven here/)).toBeInTheDocument()
  })

  it('names the corner the cursor is in, so the note lands where the driver is looking', () => {
    renderPanel()
    expect(screen.getByLabelText(/NOTE THIS PLACE — T5/)).toBeInTheDocument()
  })

  it('offers a DISTANCE anchor on a straight, not just corners', () => {
    // Half of what was asked for: "each corner or straight specifically".
    renderPanel({ activeCorner: null, cursorD: 0.5 })
    expect(screen.getByLabelText(/NOTE THIS PLACE — 2\.76 km/)).toBeInTheDocument()
  })

  it('SAVES IN ONE ACTION, with the anchor taken from the cursor', async () => {
    const onSave = vi.fn()
    renderPanel({ onSave })
    await userEvent.type(screen.getByRole('textbox'), 'Kerb takes it.')
    await userEvent.click(screen.getByRole('button', { name: 'Save note' }))
    expect(onSave).toHaveBeenCalledTimes(1)
    const arg = onSave.mock.calls[0][0]
    expect(arg.body).toBe('Kerb takes it.')
    expect(arg.cornerLabel).toBe('T5')
    // The anchor is the corner's SPAN, never its number — the identity has to
    // survive the detector renumbering it.
    expect(arg.anchor).toEqual({ dStart: 0.12, dEnd: 0.135 })
    expect(arg.anchor).not.toHaveProperty('n')
  })

  it('will not save an empty note', async () => {
    const onSave = vi.fn()
    renderPanel({ onSave })
    expect(screen.getByRole('button', { name: 'Save note' })).toBeDisabled()
    await userEvent.type(screen.getByRole('textbox'), '   ')
    expect(screen.getByRole('button', { name: 'Save note' })).toBeDisabled()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('REVISES this session’s note in place, prefilled with what it already says', () => {
    // Within one session the driver is refining a single observation, so
    // starting them from a blank box would hide what they already wrote and
    // invite them to write it twice.
    renderPanel({ notes: [note({ id: 'mine', session_key: 's-current', body: 'First thought.' })] })
    expect(screen.getByRole('textbox')).toHaveValue('First thought.')
    expect(screen.getByRole('button', { name: 'Revise' })).toBeInTheDocument()
    expect(screen.getByText(/revises this session’s note/)).toBeInTheDocument()
  })

  it('ACCUMULATES across sessions — an earlier session’s note does not prefill', () => {
    // The other half of the rule. A note from a previous session is knowledge
    // to read, not a draft to overwrite.
    renderPanel({ notes: [note({ id: 'old', session_key: 's-old', body: 'Last week.' })] })
    expect(screen.getByRole('textbox')).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Save note' })).toBeInTheDocument()
    expect(screen.getByText(/kept alongside earlier sessions’ notes/)).toBeInTheDocument()
    // …and it is still shown, because it is what the driver learned here.
    expect(screen.getByText('Last week.')).toBeInTheDocument()
  })

  it('SHOWS THE RELEVANT NOTE, NOT THE NEWEST, and hides the rest behind a count', async () => {
    // Braking points do not transfer between an LMP2 and a Hypercar. Identical
    // conditions on both, so this tests the car preference and not the
    // temperature term.
    const rightCar = note({ id: 'right', car: 'Ferrari 499P', ambient_c: 29.5, body: 'Hypercar line.', session_recorded_at: '2026-01-01T00:00:00Z' })
    const wrongCarNewer = note({ id: 'wrong', car: 'Oreca 07 Gibson', ambient_c: 29.5, body: 'LMP2 line.', session_recorded_at: '2026-08-01T00:00:00Z', session_key: 's-other' })
    renderPanel({ notes: [rightCar, wrongCarNewer] })

    const learned = screen.getByText(/WHAT YOU HAVE LEARNED HERE/).parentElement
    expect(within(learned).getByText('Hypercar line.')).toBeInTheDocument()
    expect(screen.queryByText('LMP2 line.')).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: /1 more from other session/ }))
    expect(screen.getByText('LMP2 line.')).toBeInTheDocument()
  })

  it('annotates each note by vehicle and conditions, which is what tells them apart', () => {
    renderPanel({ notes: [note()] })
    expect(screen.getByText(/Ferrari 499P · 30°C air · 39°C track/)).toBeInTheDocument()
  })

  it('FLAGS A NOTE WHOSE SESSION IS GONE, and still shows the note', () => {
    // The case the whole `on delete set null` design exists for. The note must
    // read normally; only the provenance changes, and the driver needs to know
    // because it is why they cannot go and look at the trace behind it.
    renderPanel({ notes: [note({ source_session_id: null, body: 'Survived the delete.' })] })
    expect(screen.getByText('Survived the delete.')).toBeInTheDocument()
    expect(screen.getByText(/session deleted/)).toBeInTheDocument()
    expect(screen.getByText(/Ferrari 499P/)).toBeInTheDocument()
  })

  it('RENDERS A NOTE WITH NO DETECTED CORNER, on the trace rather than as an error', () => {
    // The note is anchored to a place on the road; the road did not move, only
    // our numbering of it did. A corner-number anchor would have lost this note
    // entirely — this assertion is the design's whole justification.
    //
    // SPEC 001 CHANGED *WHEN*, NOT WHETHER. This test used to render with the
    // cursor at T5 and still find the note, because trace notes were rendered
    // unconditionally — which is the defect the owner reported from the other
    // side ("the trace notes are always shown"). The claim above survives
    // intact; the cursor now has to be at the place, exactly as it does for a
    // corner note.
    const loose = note({ id: 'loose', d_start: 0.62, d_end: 0.63, body: 'Bump on entry.' })
    renderPanel({ notes: [loose], activeCorner: null, cursorD: 0.625, liveD: 0.625 })
    expect(screen.getByText('Bump on entry.')).toBeInTheDocument()
    expect(screen.getByText('3.45 km')).toBeInTheDocument()
    expect(screen.getByText(/no corner detected here on this lap/)).toBeInTheDocument()
  })

  it('lets a driver delete their own note — the only way a note ever goes away', async () => {
    const onDelete = vi.fn()
    renderPanel({ notes: [note({ body: 'Wrong about this.' })], onDelete })
    await userEvent.click(screen.getByRole('button', { name: /Delete note: Wrong about this/ }))
    expect(onDelete).toHaveBeenCalledWith('n1')
  })

  it('surfaces a load failure without taking the telemetry down with it', () => {
    renderPanel({ error: 'Network unreachable.' })
    expect(screen.getByRole('alert')).toHaveTextContent('Network unreachable.')
    // The editor is still usable — a failed READ is not a reason to stop a
    // driver writing.
    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })

  it('will not offer to write a note against a session with no track', () => {
    renderPanel({ session: { id: 'x' } })
    expect(screen.getByRole('textbox')).toBeDisabled()
  })

  it('follows the cursor to another corner instead of carrying the last one’s words over', () => {
    const mine = note({ id: 'mine', session_key: 's-current', body: 'T5 note.' })
    const view = renderPanel({ notes: [mine] })
    expect(screen.getByRole('textbox')).toHaveValue('T5 note.')
    view.rerender(
      <TrackNotes
        notes={[mine]}
        session={SESSION}
        corners={CORNERS}
        activeCorner={CORNERS[0]}
        cursorD={0.03}
        lengthKm={5.513}
        onSave={vi.fn()}
        onDelete={vi.fn()}
      />,
    )
    expect(screen.getByRole('textbox')).toHaveValue('')
    expect(screen.getByLabelText(/NOTE THIS PLACE — T1/)).toBeInTheDocument()
  })
})

// ── Reported 28 Aug: "cannot save the note", and the location changes as the
// ── mouse travels from the map to the note box.
//
// ONE ROOT CAUSE, TWO SYMPTOMS. The anchor followed the LIVE hover cursor, and
// the editor reset its text whenever the anchor changed. So moving the pointer
// off the corner you wanted — which you must do to reach the textarea — both
// re-pointed the note somewhere else and wiped whatever you had typed. The save
// button then had nothing to save, which reads as "cannot save".
describe('picking a place to note', () => {
  const render3 = (props) =>
    render(
      <TrackNotes
        notes={[]}
        session={SESSION}
        corners={CORNERS}
        activeCorner={CORNERS[1]}
        cursorD={0.128}
        lengthKm={5.513}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        {...props}
      />,
    )

  it('DOES NOT WIPE WHAT YOU TYPED when the cursor moves', async () => {
    // The bug that made saving impossible. Typing is unsaved work; a hover
    // event is not a reason to destroy it.
    const view = render3()
    await userEvent.type(screen.getByRole('textbox'), 'Brake at the 100 board.')
    view.rerender(
      <TrackNotes notes={[]} session={SESSION} corners={CORNERS}
        activeCorner={CORNERS[0]} cursorD={0.03} lengthKm={5.513}
        onSave={vi.fn()} onDelete={vi.fn()} />,
    )
    expect(screen.getByRole('textbox')).toHaveValue('Brake at the 100 board.')
  })

  it('SURVIVES THE NOTES LOADING while you type', async () => {
    // The pin freezes the PLACE, but `existing` can still change underneath —
    // the master list arrives from the server a moment after the panel mounts,
    // or a save elsewhere refreshes it. Without the dirty guard that arrival
    // overwrites the box mid-sentence. Found by deliberately removing the guard
    // and noticing the pin test still passed: the guard was masked, not proven.
    const view = render3({ notes: [] })
    await userEvent.type(screen.getByRole('textbox'), 'Half a thought')
    view.rerender(
      <TrackNotes
        notes={[note({ id: 'arrived', session_key: 's-current', body: 'From the server.' })]}
        session={SESSION} corners={CORNERS} activeCorner={CORNERS[1]} cursorD={0.128}
        lengthKm={5.513} onSave={vi.fn()} onDelete={vi.fn()} />,
    )
    expect(screen.getByRole('textbox')).toHaveValue('Half a thought')
  })

  it('PINS THE PLACE once you start writing, so the note lands where you meant', async () => {
    const onSave = vi.fn()
    const view = render3({ onSave })
    await userEvent.type(screen.getByRole('textbox'), 'Kerb takes it.')
    // The pointer now travels across the map on its way to the Save button.
    view.rerender(
      <TrackNotes notes={[]} session={SESSION} corners={CORNERS}
        activeCorner={CORNERS[0]} cursorD={0.03} lengthKm={5.513}
        onSave={onSave} onDelete={vi.fn()} />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Save note' }))
    // T5's span, not T1's — the corner that was under the cursor when writing
    // began, which is the one the driver was looking at.
    expect(onSave.mock.calls[0][0].anchor).toEqual({ dStart: 0.12, dEnd: 0.135 })
    expect(onSave.mock.calls[0][0].cornerLabel).toBe('T5')
  })

  it('SAYS which place is pinned, and offers a way to move it', async () => {
    render3()
    await userEvent.type(screen.getByRole('textbox'), 'x')
    expect(screen.getByText(/pinned at T5/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /move to cursor/i })).toBeInTheDocument()
  })

  it('follows the cursor again after the pin is released', async () => {
    const view = render3()
    await userEvent.type(screen.getByRole('textbox'), 'x')
    await userEvent.click(screen.getByRole('button', { name: /move to cursor/i }))
    view.rerender(
      <TrackNotes notes={[]} session={SESSION} corners={CORNERS}
        activeCorner={CORNERS[0]} cursorD={0.03} lengthKm={5.513}
        onSave={vi.fn()} onDelete={vi.fn()} />,
    )
    expect(screen.getByLabelText(/NOTE THIS PLACE — T1/)).toBeInTheDocument()
  })

  it('releases the pin after a successful save, ready for the next corner', async () => {
    const onSave = vi.fn().mockResolvedValue({})
    const view = render3({ onSave })
    await userEvent.type(screen.getByRole('textbox'), 'done')
    await userEvent.click(screen.getByRole('button', { name: 'Save note' }))
    view.rerender(
      <TrackNotes notes={[]} session={SESSION} corners={CORNERS}
        activeCorner={CORNERS[0]} cursorD={0.03} lengthKm={5.513}
        onSave={onSave} onDelete={vi.fn()} />,
    )
    expect(await screen.findByLabelText(/NOTE THIS PLACE — T1/)).toBeInTheDocument()
  })

  it('still swaps in another corner’s existing note when nothing is being typed', async () => {
    // The pin must not defeat the original behaviour: with an EMPTY box there
    // is no unsaved work to protect, so the panel should keep following.
    const view = render3()
    view.rerender(
      <TrackNotes notes={[]} session={SESSION} corners={CORNERS}
        activeCorner={CORNERS[0]} cursorD={0.03} lengthKm={5.513}
        onSave={vi.fn()} onDelete={vi.fn()} />,
    )
    expect(screen.getByLabelText(/NOTE THIS PLACE — T1/)).toBeInTheDocument()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// SPEC 001 — a note shows up where the car is, and the two kinds of note behave
// identically. docs/specs/001-note-visibility/spec.md
//
// The reported defect: corner notes appeared only while the cursor sat inside a
// detected corner, while trace notes were rendered unconditionally. Not one rule
// tuned two ways — two rules of different KINDS, which is why these assertions
// are written over both kinds together wherever they can be.
// ─────────────────────────────────────────────────────────────────────────────
describe('which notes are visible', () => {
  const IN_CORNER = note({ id: 'c', d_start: 0.125, d_end: 0.130, body: 'Corner note.' })
  const ON_STRAIGHT = note({ id: 's', d_start: 0.62, d_end: 0.62, body: 'Straight note.' })

  it('shows a corner note when the cursor hovers it', () => {
    renderPanel({ notes: [IN_CORNER] })
    expect(screen.getByText('Corner note.')).toBeInTheDocument()
  })

  it('SHOWS A CORNER NOTE AS THE TRACKER PASSES, with no corner object at all', () => {
    // Replay advances DISTANCE. Gating on `activeCorner` meant a note was
    // invisible whenever the cursor's position did not resolve to a detected
    // corner — including on any lap the detector reads differently, which is
    // the case the whole distance anchor exists to survive.
    renderPanel({ notes: [IN_CORNER], activeCorner: null, cursorD: 0.128, liveD: 0.128 })
    expect(screen.getByText('Corner note.')).toBeInTheDocument()
  })

  it('shows a trace note when the cursor is at it', () => {
    renderPanel({ notes: [ON_STRAIGHT], activeCorner: null, cursorD: 0.62, liveD: 0.62 })
    expect(screen.getByText('Straight note.')).toBeInTheDocument()
  })

  it('DOES NOT SHOW A TRACE NOTE FROM THE OTHER SIDE OF THE LAP', () => {
    // The reported half: "the trace notes are always shown".
    renderPanel({ notes: [ON_STRAIGHT], cursorD: 0.128, liveD: 0.128 })
    expect(screen.queryByText('Straight note.')).not.toBeInTheDocument()
  })

  it('BOTH KINDS BEHAVE IDENTICALLY over a sweep of the lap', () => {
    // One assertion over both, deliberately: two separate tests would let the
    // two rules drift apart again, which is exactly what happened.
    const both = [IN_CORNER, ON_STRAIGHT]
    const at = (d, corner) => {
      const { unmount } = renderPanel({ notes: both, activeCorner: corner ?? null, cursorD: d, liveD: d })
      const shown = {
        corner: !!screen.queryByText('Corner note.'),
        straight: !!screen.queryByText('Straight note.'),
      }
      unmount()
      return shown
    }
    expect(at(0.128, CORNERS[1])).toEqual({ corner: true, straight: false })
    expect(at(0.62, null)).toEqual({ corner: false, straight: true })
    expect(at(0.40, null)).toEqual({ corner: false, straight: false })
  })

  it('KEEPS A PINNED PLACE VISIBLE while the lap plays on underneath it', () => {
    // A driver revising T5 must be able to read what they already wrote about
    // T5 while the tracker moves away — otherwise pinning re-creates the very
    // complaint this change fixes, in the moment they are most engaged.
    renderPanel({
      notes: [IN_CORNER, ON_STRAIGHT],
      activeCorner: CORNERS[1], cursorD: 0.128,
      picked: true,
      liveD: 0.62,
    })
    expect(screen.getByText('Corner note.')).toBeInTheDocument()
    expect(screen.getByText('Straight note.')).toBeInTheDocument()
  })

  it('renders NOTHING rather than an empty shell where there is nothing', () => {
    renderPanel({ notes: [IN_CORNER], activeCorner: null, cursorD: 0.40, liveD: 0.40 })
    expect(screen.queryByText('WHAT YOU HAVE LEARNED HERE')).not.toBeInTheDocument()
  })

  it('KEEPS EVERY NOTE REACHABLE — gating must not cost discoverability', async () => {
    // Trace notes used to render unconditionally, so positional visibility
    // takes something away unless the whole master stays one click out.
    renderPanel({ notes: [IN_CORNER, ON_STRAIGHT], activeCorner: null, cursorD: 0.40, liveD: 0.40 })
    expect(screen.queryByText('Corner note.')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /ALL NOTES AT THIS TRACK \(2\)/ }))
    expect(screen.getByText('Corner note.')).toBeInTheDocument()
    expect(screen.getByText('Straight note.')).toBeInTheDocument()
    // Labelled by place, so a list of bodies is navigable.
    expect(screen.getByText('T5')).toBeInTheDocument()
  })

  it('REVISES THIS SESSION’S NOTE ON A STRAIGHT, not only in a corner', () => {
    // Incidental to the spec and fixed by it: `mine` was read from the
    // corner-keyed map, so a second note at the same place in the same session
    // read as new on a straight — and would have collided on the unique key.
    const mine = note({ id: 'm', session_key: 's-current', d_start: 0.62, d_end: 0.62, body: 'Mine here.' })
    renderPanel({ notes: [mine], activeCorner: null, cursorD: 0.62, liveD: 0.62 })
    expect(screen.getByRole('button', { name: 'Revise' })).toBeInTheDocument()
    expect(screen.getByRole('textbox')).toHaveValue('Mine here.')
  })
})
