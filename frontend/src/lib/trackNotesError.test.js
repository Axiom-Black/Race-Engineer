import { describe, it, expect, vi } from 'vitest'

// trackNotes.js imports the Supabase client at module scope, which throws
// without env vars. The function under test is pure, so the client is stubbed
// away rather than configured — this test is about the MESSAGE, not the query.
vi.mock('./supabase', () => ({ supabase: {} }))
const { explainNotesError } = await import('./trackNotes.js')

describe('explainNotesError', () => {
  it('NAMES AN UNAPPLIED MIGRATION instead of relaying a schema-cache miss', () => {
    // The error a driver actually saw. PostgREST reports a missing table as a
    // *cache* problem, which reads like a transient fault and is not one — the
    // table is simply not in the database yet.
    const r = explainNotesError({
      code: 'PGRST205',
      message: "Could not find the table 'public.track_notes' in the schema cache",
    })
    expect(r).toMatch(/migration that has not been applied/i)
    expect(r).toMatch(/20260826000000_w03_track_notes\.sql/)
    expect(r).not.toMatch(/schema cache/i)
  })

  it('recognises the same cause reported by code, by message, or by Postgres itself', () => {
    for (const e of [
      { code: 'PGRST205', message: 'anything' },
      { message: "Could not find the table 'public.track_notes' in the schema cache" },
      { message: 'relation "public.track_notes" does not exist' },
    ]) {
      expect(explainNotesError(e)).toMatch(/migration that has not been applied/i)
    }
  })

  it('reassures that telemetry is unaffected, because it is', () => {
    // The notes panel fails inside a working session report. Without saying so,
    // the error reads as though the whole session failed to load.
    expect(explainNotesError({ code: 'PGRST205' })).toMatch(/telemetry is unaffected/i)
  })

  it('PASSES EVERY OTHER FAILURE THROUGH VERBATIM', () => {
    // Guessing at unrelated errors would trade a precise message for a vague
    // one. A network failure must still read as a network failure.
    expect(explainNotesError({ message: 'Failed to fetch' })).toBe('Failed to fetch')
    expect(explainNotesError({ code: '42501', message: 'permission denied' })).toBe('permission denied')
  })

  it('does not invent a message when there is no error', () => {
    expect(explainNotesError(null)).toBeNull()
    expect(explainNotesError(undefined)).toBeNull()
  })
})
