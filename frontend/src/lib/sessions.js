// ByteCraft Racing — Supabase persistence for parsed sessions (S5 back half).
// RLS (auth.uid()) is the isolation boundary; every query here relies on it
// rather than adding app-side WHERE clauses for security (standing bar).
//
// Trace data lives in ONE trace.json blob per session in Storage, not in
// Postgres (free-tier Postgres has a 500 MB cap; per-lap ~400-pt traces
// belong in Storage). Postgres holds session + lap SUMMARIES only —
// docs/S5_IMPLEMENTATION_PLAN.md's frozen data contract.
import { supabase } from './supabase'
import { parseSessionFiles } from './ingest'

const BUCKET = 'telemetry'

/**
 * Parse a matched .ld/.ldx/.svm triple and persist it for the signed-in user.
 *
 * Ordering matters for the atomicity standing bar: the session row is
 * inserted `pending` (claiming the dedup slot on ld_sha256 up front), then raw
 * files and the trace blob upload, laps insert, and only then does the row flip
 * to `complete` with all four storage paths set (G3.4: `complete` requires
 * ld/ldx/svm/trace paths all present).
 *
 * If anything after the initial insert fails, the attempt is rolled back —
 * the `pending` row is deleted (cascade-dropping any laps) and uploaded objects
 * are removed — so a transient failure leaves no orphaned storage and does NOT
 * keep the dedup slot. Without this rollback a single transient error would lock
 * the user out of that file forever (retry → 23505 → "already uploaded") and
 * would brick a new account whose demo seed half-failed. Uploads use `upsert`
 * so a retry after a partial upload doesn't 409.
 *
 * @param {{ld: File, ldx: File, svm: File}} files
 * @param {string} sessionType - user-supplied context (LMU exposes no
 *   session-type field to the parsers); one of practice/qualifying/race/test.
 * @param {{isDemo?: boolean}} [options]
 * @returns {Promise<string>} the new session id
 */
export async function uploadSession(files, sessionType, { isDemo = false } = {}) {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in.')

  const [ldBytes, ldxText, svmText] = await Promise.all([
    files.ld.arrayBuffer().then((b) => new Uint8Array(b)),
    files.ldx.text(),
    files.svm.text(),
  ])

  const parsed = await parseSessionFiles({ ldBytes, ldxText, svmText })
  const sessionId = crypto.randomUUID()
  const basePath = `${user.id}/${sessionId}`

  const { error: insertErr } = await supabase.from('sessions').insert({
    id: sessionId,
    venue: parsed.venue,
    driver: parsed.driver,
    car: parsed.car,
    car_class: parsed.carClass,
    ruleset: parsed.ruleset,
    session_type: sessionType,
    recorded_at: parsed.recordedAt,
    length_km: parsed.lengthKm,
    lap_count: parsed.lapCount,
    fastest_lap_no: parsed.fastestLapNo,
    fastest_lap_s: parsed.fastestLapS,
    energy_scheme: parsed.energyScheme,
    ld_sha256: parsed.ldSha256,
    ldx_sha256: parsed.ldxSha256,
    svm_sha256: parsed.svmSha256,
    summary: parsed.summary,
    setup: parsed.setup,
    ingest_status: 'pending',
    is_demo: isDemo,
  })
  if (insertErr) {
    if (insertErr.code === '23505') {
      throw new Error('You already uploaded this exact session.')
    }
    throw insertErr
  }

  const traceBlob = new Blob([JSON.stringify(parsed.trace)], { type: 'application/json' })
  try {
    const uploads = await Promise.all([
      supabase.storage.from(BUCKET).upload(`${basePath}/session.ld`, files.ld, { upsert: true }),
      supabase.storage.from(BUCKET).upload(`${basePath}/session.ldx`, files.ldx, { upsert: true }),
      supabase.storage.from(BUCKET).upload(`${basePath}/session.svm`, files.svm, { upsert: true }),
      supabase.storage.from(BUCKET).upload(`${basePath}/trace.json`, traceBlob, { upsert: true }),
    ])
    const uploadErr = uploads.find((r) => r.error)?.error
    if (uploadErr) throw uploadErr

    if (parsed.laps.length) {
      const { error: lapsErr } = await supabase.from('laps').insert(
        parsed.laps.map((l) => ({
          session_id: sessionId,
          lap_no: l.lapNo,
          lap_time_s: l.lapTimeS,
          valid: l.valid,
          summary: l.summary,
        })),
      )
      if (lapsErr) throw lapsErr
    }

    const { error: completeErr } = await supabase
      .from('sessions')
      .update({
        ld_path: `${basePath}/session.ld`,
        ldx_path: `${basePath}/session.ldx`,
        svm_path: `${basePath}/session.svm`,
        trace_path: `${basePath}/trace.json`,
        ingest_status: 'complete',
      })
      .eq('id', sessionId)
    if (completeErr) throw completeErr

    return sessionId
  } catch (err) {
    // Roll back so the failure doesn't hold the dedup slot or orphan storage.
    await rollbackSession(sessionId, basePath)
    throw err
  }
}

/**
 * Best-effort rollback of a failed upload: remove any uploaded objects and
 * delete the pending row (which cascade-drops its laps), so a retry isn't
 * blocked by the dedup constraint and nothing is orphaned. Cleanup failures are
 * logged, not thrown — the caller must surface the ORIGINAL error, not a
 * secondary cleanup one.
 */
async function rollbackSession(sessionId, basePath) {
  try {
    await supabase.storage
      .from(BUCKET)
      .remove([
        `${basePath}/session.ld`,
        `${basePath}/session.ldx`,
        `${basePath}/session.svm`,
        `${basePath}/trace.json`,
      ])
    await supabase.from('sessions').delete().eq('id', sessionId)
  } catch (cleanupErr) {
    console.warn('uploadSession rollback failed; a pending row may remain', cleanupErr)
  }
}

/** List the signed-in user's complete sessions, most recent first. */
export async function listSessions() {
  const { data, error } = await supabase
    .from('sessions')
    .select(
      'id, created_at, venue, car, car_class, session_type, recorded_at, is_demo, lap_count, fastest_lap_s, summary',
    )
    .eq('ingest_status', 'complete')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

/** Fetch one session's row + lap summaries (not the trace blob — see getSessionTrace). */
export async function getSession(sessionId) {
  const [{ data: session, error: sErr }, { data: laps, error: lErr }] = await Promise.all([
    supabase.from('sessions').select('*').eq('id', sessionId).single(),
    supabase.from('laps').select('*').eq('session_id', sessionId).order('lap_no'),
  ])
  if (sErr) throw sErr
  if (lErr) throw lErr
  return { session, laps }
}

/** Fetch and parse the trace.json blob for a session (Track Map / replay — Step 4). */
export async function getSessionTrace(session) {
  if (!session.trace_path) return null
  const { data, error } = await supabase.storage.from(BUCKET).download(session.trace_path)
  if (error) throw error
  return JSON.parse(await data.text())
}
