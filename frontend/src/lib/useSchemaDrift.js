// ByteCraft Racing — the schema-drift check, run once per signed-in session.
//
// ONCE, not on an interval. Migrations change when someone deploys, not while a
// driver is reading a lap, so polling would spend requests to learn nothing.
// The answer that matters — "does this database have what this build needs?" —
// is fixed for the life of the page, and a reload is the natural way to ask
// again. During a 14-day frozen test window a background poller is also exactly
// the kind of thing that would quietly consume a free tier's request budget.
//
// Gated on being signed in, because `applied_migrations()` is granted to
// `authenticated` only: calling it as an anonymous visitor would fail and be
// reported as UNKNOWN, which is technically true and useless noise.
import { useEffect, useState } from 'react'
import { useAuth } from './auth'
import { fetchAppliedMigrations } from './schemaDrift'
import { compareMigrations, expectedMigrations, UNKNOWN } from './migrations'

const PENDING = { status: UNKNOWN, missing: [], extra: [], checked: false }

export function useSchemaDrift() {
  const { user } = useAuth()
  const [result, setResult] = useState(PENDING)

  useEffect(() => {
    let live = true
    if (!user?.id) {
      setResult(PENDING)
      return undefined
    }
    fetchAppliedMigrations().then((applied) => {
      if (live) setResult(compareMigrations(expectedMigrations(), applied))
    })
    return () => {
      live = false
    }
  }, [user?.id])

  return result
}
