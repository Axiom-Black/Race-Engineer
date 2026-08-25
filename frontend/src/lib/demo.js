// ByteCraft Racing — demo-session seeding (S5 back half, docs/s5-implementation-plan.md Step 5).
// A brand-new account lands on a populated dashboard with zero uploads: on
// first sign-in we fetch the already-sanitized fixture (served from
// public/fixtures/ — same triple committed for CI, safe to ship) and run it
// through the real ingest+upload path, marked is_demo so it reads read-only.
// Idempotent: only runs when the caller has confirmed zero existing sessions.
import { uploadSession } from './sessions'

const FIXTURE_BASE = '/fixtures/cota_gte_sanitized'

// The .ld alone is ~853 KB. A driver's first thirty seconds on a phone or a
// hotel connection is exactly when a transient fetch failure is most likely,
// and it is also the moment that decides whether they come back — a real
// account (25 Aug) landed on an empty garage this way and never returned.
// Two cheap retries turn most blips into a slightly slower first load.
const FETCH_ATTEMPTS = 3
const RETRY_BASE_MS = 400

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function fetchAsFile(path, filename, type) {
  let lastErr
  for (let attempt = 1; attempt <= FETCH_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(path, { cache: 'force-cache' })
      // A 404 will never succeed on retry — the file is missing from the
      // deploy, which is a build problem, not a network one. Fail immediately
      // rather than making the driver wait out three attempts.
      if (res.status === 404) {
        throw new Error(`Demo fixture missing from this deploy: ${path}`)
      }
      if (!res.ok) throw new Error(`Failed to fetch demo fixture: ${path} (${res.status})`)
      const blob = await res.blob()
      return new File([blob], filename, { type })
    } catch (err) {
      lastErr = err
      if (String(err.message).includes('missing from this deploy')) throw err
      if (attempt < FETCH_ATTEMPTS) await sleep(RETRY_BASE_MS * attempt)
    }
  }
  throw lastErr
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
