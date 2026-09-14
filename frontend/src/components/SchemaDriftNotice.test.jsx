// @vitest-environment jsdom
//
// The banner that would have saved three exchanges on 28 Aug. Presentational,
// so this needs no database and no mock — the rules live in lib/migrations.js.
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SchemaDriftNotice from './SchemaDriftNotice.jsx'
import { compareMigrations, versionOf, labelOf } from '../lib/migrations'

const m = (file) => ({ file, version: versionOf(file), label: labelOf(file) })
const A = m('20260810035850_phase1_schema_rls_storage.sql')
const B = m('20260826000000_w03_track_notes.sql')

const behind = () => compareMigrations([A, B], [A.version])
const ok = () => compareMigrations([A, B], [A.version, B.version])
const unknown = () => compareMigrations([A, B], null)
const ahead = () => compareMigrations([A], [A.version, B.version])

describe('the schema drift notice', () => {
  it('RENDERS NOTHING when the schema is up to date', () => {
    const { container } = render(<SchemaDriftNotice result={ok()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('RENDERS NOTHING when the check could not run', () => {
    // Deliberate. A permanently-visible banner for an undiagnosable check
    // trains the reader to ignore banners — and the next real one.
    const { container } = render(<SchemaDriftNotice result={unknown()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('WARNS, as an alert, when the database is behind', () => {
    render(<SchemaDriftNotice result={behind()} />)
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent(/missing 1 migration/i)
    expect(alert).toHaveTextContent(/telemetry is unaffected/i)
  })

  it('names the missing FILE and the command to run', async () => {
    // A paraphrase cannot be pasted. The fix is run against these exact files.
    render(<SchemaDriftNotice result={behind()} />)
    await userEvent.click(screen.getByRole('button', { name: /how to fix/i }))
    expect(screen.getByText('20260826000000_w03_track_notes.sql')).toBeInTheDocument()
    expect(screen.getByText('supabase db push')).toBeInTheDocument()
  })

  it('EXPLAINS THE LEDGER TRAP where someone will actually hit it', async () => {
    // `supabase db push` writes a ledger row; pasting SQL into the dashboard
    // editor does not. Without this, a driver who applied by hand stares at a
    // banner they cannot clear and concludes the checker is broken.
    render(<SchemaDriftNotice result={behind()} />)
    await userEvent.click(screen.getByRole('button', { name: /how to fix/i }))
    expect(screen.getByText(/already applied by hand/i)).toBeInTheDocument()
    expect(screen.getByText(/insert into supabase_migrations\.schema_migrations/i)).toBeInTheDocument()
  })

  it('keeps the detail collapsed until asked', () => {
    render(<SchemaDriftNotice result={behind()} />)
    expect(screen.queryByText('supabase db push')).toBeNull()
    expect(screen.getByRole('button', { name: /how to fix/i })).toBeInTheDocument()
  })

  it('treats being AHEAD as information, not an alarm', () => {
    // Normal for a moment after a deploy, and on a tab left open. Shouting
    // about it would spend the reader's attention on a non-problem.
    render(<SchemaDriftNotice result={ahead()} />)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent(/older than the database/i)
    expect(screen.queryByRole('button', { name: /how to fix/i })).toBeNull()
  })

  it('survives a malformed result rather than taking the page down', () => {
    // This banner sits above the whole app. A diagnostic that can break the
    // page is worse than the problem it reports.
    for (const bad of [null, undefined, {}, { status: 'nonsense' }]) {
      const { container } = render(<SchemaDriftNotice result={bad} />)
      expect(container).toBeEmptyDOMElement()
    }
  })
})
