// ByteCraft Racing — demo-session seeding (S5 back half, docs/s5-implementation-plan.md Step 5).
// A brand-new account lands on a populated dashboard with zero uploads: on
// first sign-in we fetch the already-sanitized fixture (served from
// public/fixtures/ — same triple committed for CI, safe to ship) and run it
// through the real ingest+upload path, marked is_demo so it reads read-only.
// Idempotent: only runs when the caller has confirmed zero existing sessions.
import { uploadSession } from './sessions'

const FIXTURE_BASE = '/fixtures/cota_gte_sanitized'

async function fetchAsFile(path, filename, type) {
  const res = await fetch(path)
  if (!res.ok) throw new Error(`Failed to fetch demo fixture: ${path}`)
  const blob = await res.blob()
  return new File([blob], filename, { type })
}

/** Seed the demo session. Caller is responsible for the "has zero sessions" check. */
export async function seedDemoSession() {
  const [ld, ldx, svm] = await Promise.all([
    fetchAsFile(`${FIXTURE_BASE}.ld`, 'session.ld', 'application/octet-stream'),
    fetchAsFile(`${FIXTURE_BASE}.ldx`, 'session.ldx', 'text/xml'),
    fetchAsFile(`${FIXTURE_BASE}.svm`, 'session.svm', 'text/plain'),
  ])
  return uploadSession({ ld, ldx, svm }, 'practice', { isDemo: true })
}
