// ByteCraft Racing — asking the database which migrations it has.
//
// Thin on purpose: every rule lives in lib/migrations.js and is tested without
// a database. This is only the Supabase edge.
import { supabase } from './supabase'

/**
 * The migration versions the database reports, or **null** when the question
 * could not be answered.
 *
 * Null rather than an empty array, and the distinction is load-bearing: an
 * empty array means "the ledger genuinely has no rows", which is a real and
 * reportable state, while null means "we do not know". A check that cannot
 * reach the database must never render as "all good" — that is the same false
 * reassurance the green gates gave when they let an unapplied migration ship.
 *
 * Never throws. This is a diagnostic sitting above the whole app; a diagnostic
 * that can take the page down is worse than the problem it reports.
 */
export async function fetchAppliedMigrations() {
  try {
    const { data, error } = await supabase.rpc('applied_migrations')
    if (error) return null
    if (!Array.isArray(data)) return null
    // Supabase returns `[{version: '…'}]` for a table-returning function.
    return data
      .map((row) => (typeof row === 'string' ? row : row?.version))
      .filter((v) => typeof v === 'string' && v.trim() !== '')
  } catch {
    return null
  }
}
