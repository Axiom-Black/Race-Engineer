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
  stacksForLap, stacksAtDistance, anchorMid, pickForSession, conditionLabel, isOrphaned,
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
function Editor({ anchor, anchorName, existing, onSave, onDirty, onReleasePin, pinned, busy, disabled }) {
  const [text, setText] = useState('')
  const [saved, setSaved] = useState(false)
  // Has the DRIVER typed since the anchor last moved?
  //
  // Explicit state rather than comparing text to `existing`, because `existing`
  // changes in the same render as the anchor — by the time the effect runs, the
  // note it would have compared against is already the new corner's. Only the
  // user's own editing counts as work to protect; text that merely arrived from
  // a stored note is safe to swap out.
  const [dirty, setDirty] = useState(false)

  // Follow the cursor ONLY while the box is empty.
  //
  // This effect used to run on every anchor change, full stop — and since the
  // anchor tracked the live hover cursor, simply moving the pointer off the
  // corner (which you must do to reach this box) wiped whatever had been typed.
  // The reported symptom was "cannot save the note": there was nothing left in
  // the box by the time the button was reached.
  //
  // Unsaved text is work. A hover event is not a reason to destroy it, so the
  // swap-in only happens when there is nothing to lose.
  useEffect(() => {
    if (dirty) return
    setText(existing?.body ?? '')
    setSaved(false)
    // `dirty` is read but deliberately NOT a dependency: this must react to the
    // anchor moving, not to every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing?.id, existing?.body, anchorName])

  // Revising back to the stored wording is a no-op, so Save stays disabled —
  // but any text at all is savable when there is no stored note yet.
  const canSave = !!anchor && text.trim().length > 0 && !busy && !disabled

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (!canSave) return
        Promise.resolve(onSave(text)).then(
          () => { setSaved(true); setText(''); setDirty(false); onReleasePin?.() },
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
        onChange={(e) => {
          // Pin on the FIRST keystroke. Writing is the moment the driver has
          // committed to a place, and it is the last moment before the pointer
          // has to leave the map to reach the Save button.
          if (!dirty && e.target.value.trim()) onDirty?.()
          setDirty(true)
          setText(e.target.value)
          setSaved(false)
        }}
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
        {/* A pin the driver cannot see is a pin they cannot trust — and one they
            cannot move is a trap, since the first keystroke sets it. */}
        {pinned && (
          <>
            <span style={{ fontSize: 10, color: C.pink }}>📌 pinned at {anchorName}</span>
            <button
              type="button"
              onClick={onReleasePin}
              style={{ background: 'none', border: 'none', color: C.dim, fontSize: 10, textDecoration: 'underline', cursor: 'pointer', padding: 0 }}
            >
              move to cursor
            </button>
          </>
        )}
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

/**
 * What to call a place.
 *
 * `T7` when the stack landed on a corner this lap, its distance otherwise —
 * and a stack that matched no corner is NOT an error state. The note is
 * anchored to a place on the road; the road did not move, only our numbering
 * of it did, so it is labelled honestly rather than filed somewhere separate.
 */
function stackLabel(stack, lengthKm) {
  if (stack?.corner?.n != null) return `T${stack.corner.n}`
  return anchorLabel({ d_start: stack?.dStart, d_end: stack?.dEnd }, lengthKm)
}

/**
 * One place's notes: the relevant one, with its history behind a count.
 *
 * `pickForSession` ranks car first, then conditions, then recency — a note in
 * the car being driven beats a newer note in a different one, because braking
 * points do not transfer between an LMP2 and a Hypercar. Its own expansion
 * state, so opening T5's history does not open every other corner's.
 */
function Stack({ stack, session, lengthKm, onDelete, busy }) {
  const [open, setOpen] = useState(false)
  const ranked = pickForSession(stack, session)
  if (!ranked) return null
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ fontSize: 10, color: stack.corner ? C.pink : C.dim }}>
        {stackLabel(stack, lengthKm)}
        {!stack.corner && <span style={{ color: C.dim }}> · no corner detected here on this lap</span>}
      </div>
      <ul style={{ margin: '2px 0 0', padding: 0 }}>
        <NoteBody note={ranked.note} onDelete={onDelete} busy={busy} />
        {open && ranked.rest.map((n) => (
          <NoteBody key={n.id} note={n} onDelete={onDelete} busy={busy} />
        ))}
      </ul>
      {ranked.rest.length > 0 && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          style={{ background: 'none', border: 'none', color: C.pink, fontSize: 10.5, cursor: 'pointer', padding: '4px 0' }}
        >
          {open
            ? 'hide earlier sessions'
            : `${ranked.rest.length} more from other session${ranked.rest.length === 1 ? '' : 's'}`}
        </button>
      )}
    </div>
  )
}

export default function TrackNotes({
  notes = [],
  session,
  corners = [],
  activeCorner,
  cursorD,
  // WHERE THE CAR IS NOW, as opposed to where a new note would go.
  //
  // The two are the same thing until a pin is held: `activeCorner`/`cursorD`
  // describe the *anchor* place, and while a driver is writing about T20 the
  // parent freezes them there. Reading has to keep following the tracker
  // regardless — otherwise pinning a note re-creates the very complaint this
  // change fixes, in the one moment the driver is most engaged. Optional, so a
  // caller that omits it gets the anchor place for both.
  //
  // DISTANCE ONLY, no live corner: visibility is deliberately blind to whether
  // the detector calls this place a corner (spec 001 R3). A `liveCorner` prop
  // was planned and then dropped — an unused prop is a promise the component
  // does not keep, and it would have implied corner identity mattered here.
  liveD,
  lengthKm,
  loading,
  error,
  busy,
  picked,
  onClearPick,
  onSave,
  onDelete,
}) {
  // The PINNED place, if any. Null means "follow the cursor".
  //
  // Why a pin exists at all: the map scrubs on mousemove, so the anchor tracked
  // whatever the pointer last passed over — and the pointer has to cross the
  // map to reach this panel. Choosing a corner and then reaching for the
  // keyboard re-pointed the note somewhere else, every time. Hovering is a
  // preview; writing is a commitment, so the first keystroke freezes the place.
  const [pin, setPin] = useState(null)
  const [showEvery, setShowEvery] = useState(false)
  // ONE list of stacks, each knowing whether it landed on a detected corner.
  // Not two collections — see lib/notes.js `stacksForLap` and spec 001.
  const stacks = stacksForLap(notes, corners)

  // The place the cursor is over right now — the preview.
  const live = {
    corner: activeCorner ?? null,
    anchor: activeCorner ? anchorFromCorner(activeCorner) : anchorFromDistance(cursorD),
    name: activeCorner
      ? `T${activeCorner.n}`
      : anchorLabel({ d_start: cursorD, d_end: cursorD }, lengthKm),
  }
  // A click on the map is an EXPLICIT pick and outranks a pin set by typing —
  // clicking somewhere else is unambiguously "no, that place". The parent has
  // already resolved the click, so `live` is the picked place while it holds.
  const target = picked ? live : (pin ?? live)
  const { anchor, name: anchorName } = target
  const targetCorner = target.corner
  const isPinned = picked || !!pin
  const releasePin = () => { setPin(null); onClearPick?.() }

  /**
   * WHICH NOTES ARE VISIBLE — one rule, applied to every note.
   *
   * A stack shows while the car is at its place, whether the driver got there by
   * hovering the map or by watching the replay drive the cursor round: both move
   * the same cursor, which is why "the tracker passes that point" needs no code
   * of its own. Corner-attached and trace notes go through the identical test —
   * previously the first was gated on sitting inside a detected corner and the
   * second was gated on nothing at all, so one kind was invisible during a
   * replay and the other never went away.
   */
  const readingD = liveD ?? cursorD
  const anchorPlace = anchorMid(anchor)
  const atCursor = stacksAtDistance(stacks, readingD)
  // A HELD PIN KEEPS ITS OWN PLACE VISIBLE, on top of wherever the car now is.
  // A driver revising T20 must be able to read what they already wrote about T20
  // while the lap plays on underneath them.
  const atPin = isPinned ? stacksAtDistance(stacks, anchorPlace) : []
  const seen = new Set(atCursor.map((s) => s.anchorMid))
  const visible = [...atCursor, ...atPin.filter((s) => !seen.has(s.anchorMid))]
    .sort((a, b) => a.anchorMid - b.anchorMid)

  // This session's own note for the ANCHOR place, which is what "revise" edits.
  // Resolved from the same stacks as everything else, so revising works on a
  // straight exactly as it does in a corner — it previously read from the
  // corner-keyed map and so could only ever find a note in a detected corner.
  const mine = stacksAtDistance(stacks, anchorPlace)
    .flatMap((s) => s.notes)
    .find((n) => n.session_key === String(session?.id ?? ''))

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
          pinned={isPinned}
          // Freeze the place the pointer was over when writing began, not
          // wherever it has drifted to by the time Save is clicked.
          onDirty={() => setPin(live)}
          onReleasePin={releasePin}
          disabled={!session?.id || !session?.venue}
          onSave={(text) =>
            onSave?.({
              anchor,
              body: text,
              cornerLabel: targetCorner ? `T${targetCorner.n}` : null,
            })
          }
        />
      </div>

      {visible.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 1, color: C.dim }}>
            WHAT YOU HAVE LEARNED HERE
          </div>
          {visible.map((s) => (
            <Stack
              key={s.anchorMid}
              stack={s}
              session={session}
              lengthKm={lengthKm}
              onDelete={onDelete}
              busy={busy}
            />
          ))}
        </div>
      )}

      {/* EVERY NOTE AT THIS TRACK, collapsed.
          Trace notes used to render unconditionally, so making visibility
          positional would have taken away a driver's ability to simply *see*
          their notes. The fix for one complaint must not quietly create
          another, so the whole master stays one click away, in lap order. */}
      {stacks.length > 0 && (
        <div style={{ marginTop: 12, borderTop: `1px solid ${C.panel2}`, paddingTop: 8 }}>
          <button
            type="button"
            onClick={() => setShowEvery((v) => !v)}
            aria-expanded={showEvery}
            style={{
              background: 'none', border: 'none', color: C.pink, fontSize: 10.5,
              fontWeight: 900, letterSpacing: 1, cursor: 'pointer', padding: 0,
            }}
          >
            {showEvery ? 'HIDE' : 'SHOW'} ALL NOTES AT THIS TRACK ({total})
          </button>
          {showEvery && (
            <ul style={{ margin: '6px 0 0', padding: 0 }}>
              {stacks.map((s) => (
                <li key={s.anchorMid} style={{ listStyle: 'none' }}>
                  <div style={{ fontSize: 10, color: C.dim, marginTop: 6 }}>
                    {stackLabel(s, lengthKm)}
                  </div>
                  <ul style={{ margin: 0, padding: 0 }}>
                    {s.notes.map((n) => (
                      <NoteBody key={n.id} note={n} onDelete={onDelete} busy={busy} />
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
