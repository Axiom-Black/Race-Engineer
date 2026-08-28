// ByteCraft Racing — Track Notes persistence.
//
// The logic (anchors, keys, grouping, relevance) lives in lib/notes.js and is
// tested without a database. This file is only the Supabase edge, kept thin on
// purpose so that the rules stay testable and this stays reviewable.
//
// RLS on auth.uid() is the isolation boundary, as everywhere else in this app —
// there is deliberately no `.eq('user_id', …)` in any query below. Adding one
// would look like defence and would in fact be the standing bar's failure mode:
// it moves tenancy into application code where a single forgotten clause is a
// leak, and it masks a broken policy in testing because the app-side filter
// hides it. `user_id` is written only where the column's own default cannot see
// it, and even then the policy's WITH CHECK is what enforces it.
import { supabase } from './supabase'
import { buildNoteRow, trackKey } from './notes'

/**
 * Turn "Could not find the table 'public.track_notes' in the schema cache" into
 * something a reader can act on.
 *
 * PostgREST reports an unapplied migration as a *schema cache* miss, which
 * reads like a caching fault and is not one — the table simply is not in the
 * database yet. Migrations in this repo are applied to CI's ephemeral Postgres
 * by Ring 3 and to the live project by hand, so the two can be out of step and
 * the gates will be green while the app is broken. That gap cost a confusing
 * error on a real screen, so the message now names the actual cause.
 *
 * Everything else passes through verbatim: guessing at other failures would
 * trade a precise message for a vague one.
 */
export function explainNotesError(error) {
  if (!error) return null
  const code = error.code ?? ''
  const msg = error.message ?? String(error)
  const missingTable =
    code === 'PGRST205' ||
    (/schema cache/i.test(msg) && /track_notes/i.test(msg)) ||
    /relation .*track_notes.* does not exist/i.test(msg)
  return missingTable
    ? 'Track Notes needs a database migration that has not been applied to this project yet ' +
      '(supabase/migrations/20260826000000_w03_track_notes.sql). Your telemetry is unaffected.'
    : msg
}

const COLUMNS =
  'id, created_at, updated_at, track_key, track_label, anchor_key, d_start, d_end, ' +
  'corner_label, body, source_session_id, session_key, session_recorded_at, ' +
  'car, car_class, ambient_c, track_c'

/**
 * Every note this driver holds for one track — the master copy, in lap order.
 *
 * Keyed on the TRACK, not on the session, which is the whole point: the master
 * accumulates across every session ever driven there and survives the deletion
 * of any of them. `anchor_key` is zero-padded so ordering by it walks the lap
 * from start to finish, served by `track_notes_master_idx` alone.
 */
export async function listTrackNotes(venue) {
  const key = trackKey(venue)
  if (!key) return []
  const { data, error } = await supabase
    .from('track_notes')
    .select(COLUMNS)
    .eq('track_key', key)
    .order('anchor_key', { ascending: true })
    .order('session_recorded_at', { ascending: false, nullsFirst: false })
  if (error) throw error
  return data ?? []
}

/** Every track this driver has notes on, with a count — the master's index. */
export async function listNotedTracks() {
  const { data, error } = await supabase
    .from('track_notes')
    .select('track_key, track_label, updated_at')
    .order('updated_at', { ascending: false })
  if (error) throw error

  const byTrack = new Map()
  for (const row of data ?? []) {
    const existing = byTrack.get(row.track_key)
    if (existing) existing.count += 1
    else
      byTrack.set(row.track_key, {
        trackKey: row.track_key,
        // The label from the most recent note wins, because the rows arrive
        // newest-first — so a venue string that changed spelling between
        // exports shows as the driver last saw it.
        label: row.track_label || row.track_key,
        lastNoteAt: row.updated_at,
        count: 1,
      })
  }
  return [...byTrack.values()]
}

/**
 * Write a note.
 *
 * **Upsert on `(user_id, track_key, anchor_key, session_key)`** — which is
 * exactly the owner's rule expressed as a constraint: revise within a session,
 * accumulate across sessions. Writing again about the same corner in the same
 * session updates in place; the same corner in a *new* session inserts a
 * revision alongside. No client-side "does one exist?" read, because that read
 * would be a race and the database already knows.
 *
 * `user_id` is passed explicitly rather than left to the column default: an
 * upsert's ON CONFLICT has to see every column of the conflict target to
 * resolve it, and `auth.uid()` as a DEFAULT is not applied on the conflict
 * path. The RLS WITH CHECK still rejects any value but the caller's own, so
 * passing it does not widen anything.
 */
export async function saveNote({ session, anchor, body, cornerLabel }) {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in.')

  const row = buildNoteRow({ userId: user.id, session, anchor, body, cornerLabel })
  if (!row) throw new Error('A note needs some text and a track.')

  const { data, error } = await supabase
    .from('track_notes')
    .upsert(row, { onConflict: 'user_id,track_key,anchor_key,session_key' })
    .select(COLUMNS)
    .single()
  if (error) throw error
  return data
}

/**
 * Delete one note by id.
 *
 * Deleting a NOTE is the driver discarding something they wrote, and that is
 * the only way a note ever goes away — deleting the *session* deliberately does
 * not (the FK is `on delete set null`), because a session is a recording and a
 * note is knowledge.
 */
export async function deleteNote(noteId) {
  const { error } = await supabase.from('track_notes').delete().eq('id', noteId)
  if (error) throw error
}
