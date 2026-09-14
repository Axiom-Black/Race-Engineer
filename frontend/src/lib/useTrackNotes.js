// ByteCraft Racing — the Track Notes master for one track, loaded once.
//
// Keyed on the TRACK, not on the session being viewed, which is the whole
// point of the feature: the master accumulates across every session ever
// driven there, and it survives the deletion of any of them. Open a session at
// COTA and you see what you have learned at COTA — including from sessions you
// have since deleted.
//
// The hook owns loading and writing; lib/notes.js owns the rules and
// lib/trackNotes.js the queries. Components stay presentational so they can be
// tested without a database.
import { useCallback, useEffect, useState } from 'react'
import { listTrackNotes, saveNote, deleteNote, explainNotesError } from './trackNotes'

export function useTrackNotes(venue) {
  const [notes, setNotes] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const reload = useCallback(async () => {
    if (!venue) {
      setNotes([])
      return
    }
    setLoading(true)
    setError(null)
    try {
      setNotes(await listTrackNotes(venue))
    } catch (e) {
      // Notes failing to load must not take the session report down with it —
      // the telemetry is still worth reading. Surfaced in the panel instead.
      setError(explainNotesError(e) || 'Could not load your notes for this track.')
    } finally {
      setLoading(false)
    }
  }, [venue])

  useEffect(() => {
    let live = true
    if (!venue) {
      setNotes([])
      return undefined
    }
    setLoading(true)
    setError(null)
    listTrackNotes(venue)
      .then((rows) => {
        if (live) setNotes(rows)
      })
      .catch((e) => {
        if (live) setError(explainNotesError(e) || 'Could not load your notes for this track.')
      })
      .finally(() => {
        if (live) setLoading(false)
      })
    return () => {
      live = false
    }
  }, [venue])

  /**
   * Write or revise. The returned row is merged into local state by id, so a
   * revision replaces its predecessor in place and a new session's note appears
   * alongside — the same revise/accumulate rule the unique key enforces, so the
   * screen agrees with the database without a refetch.
   */
  const save = useCallback(async ({ session, anchor, body, cornerLabel }) => {
    setBusy(true)
    setError(null)
    try {
      const row = await saveNote({ session, anchor, body, cornerLabel })
      setNotes((prev) => {
        const rest = prev.filter((n) => n.id !== row.id)
        return [...rest, row]
      })
      return row
    } catch (e) {
      setError(explainNotesError(e) || 'Could not save that note.')
      throw e
    } finally {
      setBusy(false)
    }
  }, [])

  const remove = useCallback(async (noteId) => {
    setBusy(true)
    setError(null)
    try {
      await deleteNote(noteId)
      setNotes((prev) => prev.filter((n) => n.id !== noteId))
    } catch (e) {
      setError(explainNotesError(e) || 'Could not delete that note.')
      throw e
    } finally {
      setBusy(false)
    }
  }, [])

  return { notes, loading, error, busy, save, remove, reload }
}
