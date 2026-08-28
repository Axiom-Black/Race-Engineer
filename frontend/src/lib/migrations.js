// ByteCraft Racing — does the database have the schema this bundle expects?
//
// WHY THIS EXISTS. Ring 3 applies every file in supabase/migrations/ to a
// throwaway Postgres and asserts against it. That is a real gate, and it is
// structurally incapable of noticing the one thing that broke on 28 Aug: the
// live project had never been given the track_notes migration. The gate builds
// its own database from the same files it is testing, so "the files are
// consistent" is all it can ever prove. Merging does not deploy schema, nothing
// connects the two, and the failure surfaced to a driver as PostgREST's
// "Could not find the table 'public.track_notes' in the schema cache" — which
// reads like a transient caching fault and is nothing of the kind.
//
// So the bundle now carries the list of migrations it was built against, asks
// the database what it has, and reports the difference. It does NOT apply
// anything. That is a deliberately smaller promise than a deploy step: the
// alternative considered was `supabase db push` in CI, which closes the gap
// completely but puts a schema-write credential for the production database
// into GitHub Actions — the first production secret this repo would hold.
// Detecting costs nothing and tells you exactly what to run.
//
// THE SHAPE OF THE ANSWER MATTERS. Three states, not two:
//
//   ok       — the database has everything this bundle expects
//   behind   — the database is MISSING migrations (the dangerous one: features
//              in this bundle will fail against this schema)
//   ahead    — the database has migrations this bundle does not know about
//              (harmless, and normal for a moment after a deploy, or on an
//              older browser tab)
//   unknown  — we could not find out
//
// `unknown` is a first-class answer and never renders as "ok". A check that
// cannot reach the database reporting "all good" is worse than no check: it is
// the same false reassurance the green gates gave.

/* global __MIGRATIONS__ */

/** Vite replaces this at build time (vite.config.js); the guard is for tests. */
const RAW_MIGRATIONS = typeof __MIGRATIONS__ === 'undefined' ? [] : __MIGRATIONS__

export const OK = 'ok'
export const BEHIND = 'behind'
export const AHEAD = 'ahead'
export const UNKNOWN = 'unknown'

/**
 * The version Supabase records for a migration file.
 *
 * `20260826000000_w03_track_notes.sql` → `20260826000000`. The leading
 * timestamp is the ledger's primary key; everything after the first underscore
 * is a human label that plays no part in identity.
 *
 * Returns null for anything that is not a migration filename, so a stray file
 * in the directory cannot masquerade as a missing migration.
 */
export function versionOf(filename) {
  if (typeof filename !== 'string') return null
  const m = /^(\d{10,})_/.exec(filename.trim())
  return m ? m[1] : null
}

/** The readable half of the filename: `w03_track_notes`. */
export function labelOf(filename) {
  if (typeof filename !== 'string') return null
  const m = /^\d{10,}_(.+)\.sql$/.exec(filename.trim())
  return m ? m[1] : null
}

/** Every migration version this bundle was built against, in order. */
export function expectedMigrations() {
  return RAW_MIGRATIONS.map((f) => ({
    file: f,
    version: versionOf(f),
    label: labelOf(f),
  })).filter((m) => m.version !== null)
}

/**
 * Compare what the bundle expects against what the database reports.
 *
 * @param {Array<{file,version,label}>} expected
 * @param {Array<string>|null} applied  versions from the database, or null when
 *   the question could not be answered
 * @returns {{status, missing, extra, checked}}
 *
 * `applied` being null yields UNKNOWN — deliberately distinct from an empty
 * array, which means "the database genuinely has no migrations recorded" and is
 * a real, reportable state.
 */
export function compareMigrations(expected, applied) {
  const want = Array.isArray(expected) ? expected.filter((m) => m?.version) : []

  if (!Array.isArray(applied)) {
    return { status: UNKNOWN, missing: [], extra: [], checked: false }
  }
  // An empty expectation means the build could not read supabase/migrations/.
  // Reporting every applied migration as "ahead" would be a fabricated alarm.
  if (want.length === 0) {
    return { status: UNKNOWN, missing: [], extra: [], checked: false }
  }

  // Filter BEFORE stringifying: `String(null)` is the non-empty string 'null',
  // which would survive a truthiness filter and be reported as a migration the
  // database has and the bundle does not — a fabricated AHEAD from a null row.
  const have = new Set(
    applied
      .filter((v) => typeof v === 'string' || typeof v === 'number')
      .map((v) => String(v).trim())
      .filter((v) => v !== ''),
  )
  const wantSet = new Set(want.map((m) => m.version))

  const missing = want.filter((m) => !have.has(m.version))
  const extra = [...have].filter((v) => !wantSet.has(v)).sort()

  // BEHIND outranks AHEAD when both are true. Being ahead is harmless; being
  // behind means a feature in this bundle will fail, and a driver should be
  // told the thing that can hurt them rather than the tidier summary.
  const status = missing.length > 0 ? BEHIND : extra.length > 0 ? AHEAD : OK
  return { status, missing, extra, checked: true }
}

/** Is this the state that breaks features? */
export function isBlocking(result) {
  return result?.status === BEHIND
}

/**
 * What to say, and what to do about it.
 *
 * Names the migration files rather than describing them, because the fix is to
 * run something against those exact files and a paraphrase cannot be pasted.
 */
export function driftMessage(result) {
  // Allow-list the statuses that produce a message, rather than excluding the
  // ones that do not. This banner renders above the whole app, so an
  // unrecognised shape must fall through to silence — not to a crash on
  // `result.missing`. A diagnostic that can take the page down is worse than
  // the problem it reports.
  if (result?.status !== BEHIND && result?.status !== AHEAD) return null

  if (result.status === AHEAD) {
    if (!Array.isArray(result.extra)) return null
    return {
      tone: 'info',
      title: 'This page is older than the database',
      detail:
        `The database has ${result.extra.length} migration` +
        `${result.extra.length === 1 ? '' : 's'} this build does not know about. ` +
        'Usually a deploy that has just landed — reload to pick it up.',
      fix: null,
    }
  }

  if (!Array.isArray(result.missing) || result.missing.length === 0) return null
  const files = result.missing.map((m) => m.file)
  return {
    tone: 'warn',
    title: `The database is missing ${files.length} migration${files.length === 1 ? '' : 's'}`,
    detail:
      'Features in this build depend on schema the project does not have yet, ' +
      'and they will fail with a "schema cache" error until it is applied. ' +
      'Your existing telemetry is unaffected.',
    fix: `supabase db push`,
    files,
  }
}

/**
 * The ledger's one sharp edge, said out loud where a reader will meet it.
 *
 * `supabase_migrations.schema_migrations` is written by the Supabase CLI. A
 * migration pasted into the dashboard's SQL editor applies perfectly and is
 * NEVER recorded — so its tables exist while the ledger says they do not, and
 * this check reports drift that is real in the bookkeeping and invisible in the
 * schema. That is worth knowing rather than papering over: the project's
 * recorded history genuinely does not match the repo, and the next `db push`
 * will try to re-apply it.
 */
export function ledgerBackfillSql(missing) {
  const rows = (missing ?? [])
    .filter((m) => m?.version)
    .map((m) => `  ('${m.version}', '${m.label ?? ''}')`)
    .join(',\n')
  if (!rows) return null
  return (
    'insert into supabase_migrations.schema_migrations (version, name)\nvalues\n' +
    rows +
    '\non conflict (version) do nothing;'
  )
}

/** How many migrations this bundle knows about — for the marker's tooltip. */
export function expectedCount() {
  return expectedMigrations().length
}

/** Exposed for tests that need to reason about the raw inlined value. */
export function rawMigrations() {
  return [...RAW_MIGRATIONS]
}
