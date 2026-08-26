// ByteCraft Racing — Track Notes, beside the map.
//
// Presentational on purpose: it takes notes and two callbacks and knows nothing
// about Supabase, so its behaviour is testable without a database and without
// the app's env vars. Loading lives in lib/useTrackNotes.js.
//
// WHAT THE PANEL IS FOR. A driver's own track guide, built from their own laps.
// It sits under the map because that is where a note is *written* — you see the
// corner, you remember what you did, you write it down. Filing it behind a
// settings page would measure navigation instead of the note (the same D3
// reasoning that put the unit toggle in the header).
//
// THREE THINGS IT HAS TO GET RIGHT, ALL OF THEM OWNER DECISIONS:
//
//   * The note that shows is the RELEVANT one, not the newest. Braking points
//     do not transfer between an LMP2 and a Hypercar, so a newer note in the
//     wrong car is worth less than an older one in the right car. Ranked in
//     lib/notes.js `pickForSession`; the rest collapse behind a count, which is
//     what stops a busy corner becoming a wall of text.
//   * A note whose session has been deleted still reads. Its car, conditions
//     and date were copied onto it at write time; all that changes is a
//     provenance flag saying the recording is gone. This is the case the whole
//     `on delete set null` design exists for, so the panel says it out loud
//     rather than showing a blank where the session used to be.
//   * A note anchored where the detector no longer finds a corner is NOT an
//     error. The note is anchored to a place on the road; the road did not move,
//     only our numbering of it did. Those render on the trace at their own
//     distance and are listed here as "on the trace".
import { useEffect, useState } from 'react'
import { C, font } from '../theme'
import { Button } from './ui'
import {
  attachToCorners, pickForSession, conditionLabel, isOrphaned,
  anchorFromCorner, anchorFromDistance, anchorLabel, MAX_NOTE_CHARS,
} from '../lib/notes'

function Provenance({ note }) {
  const label = conditionLabel({ car: note.car, ambientC: note.ambient_c, trackC: note.track_c })
  const when = note.session_recorded_at ? new Date(note.session_recorded_at).toLocaleDateString() : null
  return (
    <div style={{ fontSize: 10, color: C.dim, marginTop: 4, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {label && <span>{label}</span>}
      {when && <span>· {when}</span>}
      {/* The provenance signal. The note is intact and readable; only the
          recording behind it is gone — which the driver needs to know, because
          it is why they cannot go and look at the trace it came from. */}
      {isOrphaned(note) && (
        <span title="The session this note came from has been deleted. The note is kept." style={{ color: C.warn }}>
          · session deleted
        </span>
      )}
    </div>
  )
}

function NoteBody({ note, onDelete, busy }) {
  return (
    <li style={{ listStyle: 'none', padding: '8px 0', borderTop: `1px solid ${C.panel2}` }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <p style={{ flex: 1, margin: 0, fontSize: 12.5, color: C.silver2, whiteSpace: 'pre-wrap' }}>{note.body}</p>
        <button
          type="button"
          onClick={() => onDelete?.(note.id)}
          disabled={busy}
          aria-label={`Delete note: ${note.body.slice(0, 40)}`}
          title="Delete this note"
          style={{ background: 'none', border: 'none', color: C.dim, cursor: 'pointer', fontSize: 13, padding: 0 }}
        >
          ✕
        </button>
      </div>
      <Provenance note={note} />
    </li>
  )
}

/**
 * The editor for the place the cursor is at.
 *
 * Prefilled with **this session's own note** for the anchor if one exists,
 * because writing again in the same session is a revision — the driver is
 * refining one observation, and starting them from a blank box would hide what
 * they already said and invite them to write it twice. Across sessions it is
 * blank, because that is a new observation.
 */
function Editor({ anchor, anchorName, existing, onSave, busy, disabled }) {
  const [text, setText] = useState('')
  const [saved, setSaved] = useState(false)

  // Follow the cursor: moving to another corner swaps in that corner's own
  // draft-or-existing text rather than carrying the last corner's words over.
  useEffect(() => {
    setText(existing?.body ?? '')
    setSaved(false)
  }, [existing?.id, existing?.body, anchorName])

  const canSave = !!anchor && text.trim().length > 0 && !busy && !disabled

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (!canSave) return
        Promise.resolve(onSave(text)).then(
          () => setSaved(true),
          () => setSaved(false),
        )
      }}
    >
      <label
        htmlFor="track-note-body"
        style={{ display: 'block', fontSize: 10, fontWeight: 900, letterSpacing: 1, color: C.dim, marginBottom: 5 }}
      >
        {existing ? `REVISE YOUR NOTE — ${anchorName}` : `NOTE THIS PLACE — ${anchorName}`}
      </label>
      <textarea
        id="track-note-body"
        value={text}
        onChange={(e) => { setText(e.target.value); setSaved(false) }}
        maxLength={MAX_NOTE_CHARS}
        rows={3}
        disabled={disabled}
        placeholder={disabled ? 'Upload a session at this track to start noting it.' : 'Brake 10 m later — the kerb takes it.'}
        style={{
          width: '100%', boxSizing: 'border-box', background: C.panel2, color: C.silver2,
          border: `1px solid ${C.panel2}`, borderRadius: 6, padding: 8,
          fontSize: 12.5, fontFamily: font.ui, resize: 'vertical',
        }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
        <Button type="submit" disabled={!canSave}>{existing ? 'Revise' : 'Save note'}</Button>
        {saved && <span style={{ fontSize: 10, color: C.pink }}>saved to your {anchorName} notes</span>}
        {/* Said plainly, because it is the surprising half of the rule and the
            driver is the one who has to predict it. */}
        <span style={{ fontSize: 10, color: C.dim, marginLeft: 'auto' }}>
          {existing ? 'revises this session’s note' : 'kept alongside earlier sessions’ notes'}
        </span>
      </div>
    </form>
  )
}

export default function TrackNotes({
  notes = [],
  session,
  corners = [],
  activeCorner,
  cursorD,
  lengthKm,
  loading,
  error,
  busy,
  onSave,
  onDelete,
}) {
  const [showAll, setShowAll] = useState(false)
  const { attached, loose } = attachToCorners(notes, corners)

  // The anchor being written to: the corner the cursor is inside, or — on a
  // straight, which is half of what the owner asked to be notable — the exact
  // distance the cursor is at.
  const anchor = activeCorner
    ? anchorFromCorner(activeCorner)
    : anchorFromDistance(cursorD)
  const anchorName = activeCorner ? `T${activeCorner.n}` : anchorLabel({ d_start: cursorD, d_end: cursorD }, lengthKm)

  const stack = activeCorner
    ? attached.get(activeCorner.n)
    : null
  const here = stack ? pickForSession(stack, session) : null
  // This session's own note for the anchor, which is what "revise" edits.
  const mine = (stack?.notes ?? []).find((n) => n.session_key === String(session?.id ?? ''))

  const total = notes.length

  return (
    <section
      aria-label="Track notes"
      style={{ marginTop: 12, borderTop: `1px solid ${C.panel2}`, paddingTop: 12 }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: 12, fontWeight: 900, letterSpacing: 1, color: C.silver3 }}>
          TRACK NOTES{session?.venue ? ` — ${session.venue}` : ''}
        </h3>
        {/* Says out loud that the master is bigger than this session, which is
            the feature and is otherwise invisible. */}
        <span style={{ fontSize: 10, color: C.dim }}>
          {loading ? 'loading…' : `${total} note${total === 1 ? '' : 's'} across every session you have driven here`}
        </span>
      </div>

      {error && (
        <p role="alert" style={{ fontSize: 11, color: C.warn, marginTop: 8 }}>{error}</p>
      )}

      <div style={{ marginTop: 10 }}>
        <Editor
          anchor={anchor}
          anchorName={anchorName}
          existing={mine}
          busy={busy}
          disabled={!session?.id || !session?.venue}
          onSave={(text) =>
            onSave?.({
              anchor,
              body: text,
              cornerLabel: activeCorner ? `T${activeCorner.n}` : null,
            })
          }
        />
      </div>

      {here && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 1, color: C.dim }}>
            WHAT YOU HAVE LEARNED HERE
          </div>
          <ul style={{ margin: '4px 0 0', padding: 0 }}>
            <NoteBody note={here.note} onDelete={onDelete} busy={busy} />
            {showAll && here.rest.map((n) => (
              <NoteBody key={n.id} note={n} onDelete={onDelete} busy={busy} />
            ))}
          </ul>
          {here.rest.length > 0 && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              style={{ background: 'none', border: 'none', color: C.pink, fontSize: 10.5, cursor: 'pointer', padding: '4px 0' }}
            >
              {showAll
                ? 'hide earlier sessions'
                : `${here.rest.length} more from other session${here.rest.length === 1 ? '' : 's'}`}
            </button>
          )}
        </div>
      )}

      {loose.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 1, color: C.dim }}>
            ON THE TRACE — no corner detected here on this lap
          </div>
          {/* Not an error state. The note is anchored to a place on the road and
              the road did not move; only our numbering of it did. */}
          <ul style={{ margin: '4px 0 0', padding: 0 }}>
            {loose.map((g) => (
              <li key={g.anchorMid} style={{ listStyle: 'none' }}>
                <div style={{ fontSize: 10, color: C.dim, marginTop: 6 }}>
                  {anchorLabel({ d_start: g.dStart, d_end: g.dEnd }, lengthKm)}
                </div>
                <ul style={{ margin: 0, padding: 0 }}>
                  {g.notes.map((n) => (
                    <NoteBody key={n.id} note={n} onDelete={onDelete} busy={busy} />
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
