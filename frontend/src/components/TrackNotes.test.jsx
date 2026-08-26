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
    renderPanel({ notes: [note({ id: 'loose', d_start: 0.62, d_end: 0.63, body: 'Bump on entry.' })] })
    expect(screen.getByText(/ON THE TRACE — no corner detected here on this lap/)).toBeInTheDocument()
    expect(screen.getByText('Bump on entry.')).toBeInTheDocument()
    expect(screen.getByText('3.45 km')).toBeInTheDocument()
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
