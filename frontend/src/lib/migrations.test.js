import { describe, it, expect } from 'vitest'
import {
  OK, BEHIND, AHEAD, UNKNOWN,
  versionOf, labelOf, expectedMigrations, compareMigrations,
  isBlocking, driftMessage, ledgerBackfillSql, expectedCount, rawMigrations,
} from './migrations.js'

const m = (file) => ({ file, version: versionOf(file), label: labelOf(file) })

const A = m('20260810035850_phase1_schema_rls_storage.sql')
const B = m('20260826000000_w03_track_notes.sql')
const C = m('20260828150000_migration_ledger_reader.sql')

describe('versionOf', () => {
  it('takes the leading timestamp, which is what the ledger keys on', () => {
    expect(versionOf('20260826000000_w03_track_notes.sql')).toBe('20260826000000')
  })

  it('ignores the human half, because renaming must not change identity', () => {
    // CONTRIBUTING: an applied migration is never renamed. But if the label
    // ever did change, the version — and therefore the comparison — must not.
    expect(versionOf('20260826000000_w03_track_notes.sql'))
      .toBe(versionOf('20260826000000_totally_different_name.sql'))
  })

  it('REFUSES anything that is not a migration filename', () => {
    // A stray file in the directory must not be able to masquerade as a
    // missing migration and raise a permanent, unfixable alarm.
    for (const bad of ['README.md', 'notes.sql', '_leading.sql', '123_short.sql', '', null, 42, {}]) {
      expect(versionOf(bad)).toBeNull()
    }
  })
})

describe('labelOf', () => {
  it('reads the human half, for the ledger backfill row', () => {
    expect(labelOf('20260826000000_w03_track_notes.sql')).toBe('w03_track_notes')
  })

  it('is null when there is no label to read', () => {
    expect(labelOf('README.md')).toBeNull()
    expect(labelOf(null)).toBeNull()
  })
})

describe('compareMigrations', () => {
  it('is OK when the database has everything the bundle expects', () => {
    const r = compareMigrations([A, B], [A.version, B.version])
    expect(r).toMatchObject({ status: OK, missing: [], extra: [], checked: true })
  })

  it('is BEHIND when the database is missing one — the case that broke on 28 Aug', () => {
    const r = compareMigrations([A, B], [A.version])
    expect(r.status).toBe(BEHIND)
    expect(r.missing.map((x) => x.file)).toEqual([B.file])
    expect(isBlocking(r)).toBe(true)
  })

  it('is AHEAD when the database knows migrations this build does not', () => {
    // Normal for a moment after a deploy, and on a browser tab left open.
    const r = compareMigrations([A], [A.version, B.version])
    expect(r.status).toBe(AHEAD)
    expect(r.extra).toEqual([B.version])
    expect(isBlocking(r)).toBe(false)
  })

  it('reports BEHIND over AHEAD when BOTH are true', () => {
    // Being ahead is harmless; being behind means a feature will fail. The
    // driver must be told the thing that can hurt them, not the tidier one.
    const r = compareMigrations([A, B], [A.version, C.version])
    expect(r.status).toBe(BEHIND)
    expect(r.missing.map((x) => x.file)).toEqual([B.file])
    expect(r.extra).toEqual([C.version])
  })

  it('DISTINGUISHES "could not ask" FROM "the ledger is empty"', () => {
    // The load-bearing distinction in this module. A check that cannot reach
    // the database must never read as "all good" — that is precisely the false
    // reassurance the green gates gave when an unapplied migration shipped.
    expect(compareMigrations([A], null).status).toBe(UNKNOWN)
    expect(compareMigrations([A], undefined).status).toBe(UNKNOWN)

    // An empty ledger is a real, reportable state: everything is missing.
    const empty = compareMigrations([A, B], [])
    expect(empty.status).toBe(BEHIND)
    expect(empty.missing).toHaveLength(2)
  })

  it('is UNKNOWN rather than AHEAD when the BUILD could not read the folder', () => {
    // resolveMigrations() returns [] if supabase/migrations is unreadable.
    // Calling every applied migration "extra" would be a fabricated alarm from
    // a build-side problem the driver cannot act on.
    expect(compareMigrations([], [A.version, B.version]).status).toBe(UNKNOWN)
    expect(compareMigrations(null, [A.version]).status).toBe(UNKNOWN)
  })

  it('never reports UNKNOWN as checked', () => {
    expect(compareMigrations([A], null).checked).toBe(false)
    expect(compareMigrations([A], [A.version]).checked).toBe(true)
  })

  it('tolerates whitespace and junk in what the database returns', () => {
    expect(compareMigrations([A], [` ${A.version} `]).status).toBe(OK)
    expect(compareMigrations([A], [A.version, '', null]).status).toBe(OK)
  })
})

describe('driftMessage', () => {
  it('says nothing at all when there is nothing to say', () => {
    // Silent on OK, and silent on UNKNOWN. A permanently-visible banner for an
    // undiagnosable check trains the reader to ignore banners.
    expect(driftMessage(compareMigrations([A], [A.version]))).toBeNull()
    expect(driftMessage(compareMigrations([A], null))).toBeNull()
    expect(driftMessage(null)).toBeNull()
  })

  it('NAMES THE FILES, because the fix is run against those exact files', () => {
    const msg = driftMessage(compareMigrations([A, B], [A.version]))
    expect(msg.tone).toBe('warn')
    expect(msg.files).toEqual([B.file])
    expect(msg.fix).toBe('supabase db push')
  })

  it('reassures that telemetry is unaffected, because it is', () => {
    const msg = driftMessage(compareMigrations([A, B], [A.version]))
    expect(msg.detail).toMatch(/telemetry is unaffected/i)
  })

  it('treats AHEAD as information, not a warning', () => {
    const msg = driftMessage(compareMigrations([A], [A.version, B.version]))
    expect(msg.tone).toBe('info')
    expect(msg.fix).toBeNull()
    expect(msg.title).toMatch(/older than the database/i)
  })

  it('agrees with itself on singular and plural', () => {
    expect(driftMessage(compareMigrations([A, B], [A.version])).title).toMatch(/1 migration\b/)
    expect(driftMessage(compareMigrations([A, B, C], [])).title).toMatch(/3 migrations\b/)
  })
})

describe('ledgerBackfillSql', () => {
  it('writes the row the CLI would have written', () => {
    // The ledger's sharp edge: `supabase db push` records a row, pasting SQL
    // into the dashboard editor does NOT. A migration applied by hand shows as
    // missing forever, with its tables sitting right there in the database.
    const sql = ledgerBackfillSql([B])
    expect(sql).toContain('supabase_migrations.schema_migrations')
    expect(sql).toContain("('20260826000000', 'w03_track_notes')")
    // Idempotent: running it twice must not error, because someone will.
    expect(sql).toContain('on conflict (version) do nothing')
  })

  it('handles several at once', () => {
    const sql = ledgerBackfillSql([B, C])
    expect(sql).toContain(B.version)
    expect(sql).toContain(C.version)
  })

  it('is null when there is nothing to backfill', () => {
    expect(ledgerBackfillSql([])).toBeNull()
    expect(ledgerBackfillSql(null)).toBeNull()
    expect(ledgerBackfillSql([{ file: 'junk' }])).toBeNull()
  })
})

describe('the inlined migration list', () => {
  it('is whatever Vite substituted, and every entry parses', () => {
    // Vite's `define` DOES apply under vitest, so this is the real repo list
    // rather than a stub — which means the count cannot be asserted (it grows
    // with every migration) but the SHAPE can.
    for (const entry of rawMigrations()) {
      expect(entry).toMatch(/\.sql$/)
      expect(versionOf(entry)).not.toBeNull()
    }
    expect(expectedCount()).toBe(expectedMigrations().length)
  })

  it('agrees with itself: the real repo compares OK against its own versions', () => {
    // A self-consistency check rather than a pinned number. If the loader ever
    // returned filenames the parser rejects, this goes red without needing to
    // know how many migrations exist today.
    const expected = expectedMigrations()
    if (expected.length === 0) return // build could not read the folder
    const r = compareMigrations(expected, expected.map((x) => x.version))
    expect(r.status).toBe(OK)
  })
})
