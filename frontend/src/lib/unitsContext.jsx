// ByteCraft Racing — one source of truth for the unit system, app-wide.
//
// WHY A CONTEXT AND NOT A PROP. Units touch nearly every number on screen —
// the headline stats, the instrument clusters, the channel inventory, the map
// panel. Threading a prop through all of that guarantees one component gets
// missed, and a screen mixing km/h and mph is a correctness bug, not a cosmetic
// one: it silently invites a driver to compare two numbers that are not
// comparable. A context makes "every consumer reads the same value" structural
// rather than something to remember.
//
// The preference itself lives in lib/prefs.js (per driver, per browser — see
// the limitation noted there, which Iteration 5's D3 probe is measuring rather
// than assuming). This file only holds it in memory and keeps it in step with
// whoever is signed in.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { UnitsContext } from './unitsStore'
import { useAuth } from './auth'
import { loadUnits, saveUnits } from './prefs'
import { convert as convertRaw, format as formatRaw, DEFAULT_SYSTEM } from './units'

export function UnitsProvider({ children }) {
  const { user } = useAuth()
  const [system, setSystem] = useState(DEFAULT_SYSTEM)
  const [storageFailed, setStorageFailed] = useState(false)

  // Re-read whenever the signed-in driver changes, so switching accounts in one
  // browser does not inherit the other's choice. Same reasoning as the tiers.
  useEffect(() => {
    setSystem(loadUnits(user?.id))
    setStorageFailed(false)
  }, [user?.id])

  const choose = useCallback(
    (next) => {
      setSystem(next)
      // saveUnits reports a failed write (private browsing, storage disabled)
      // rather than throwing. Surface it instead of silently losing the choice
      // — a preference that claims to be saved and is not is worse than one
      // that admits it cannot be.
      setStorageFailed(!saveUnits(user?.id, next))
    },
    [user?.id],
  )

  const value = useMemo(
    () => ({
      system,
      choose,
      storageFailed,
      /** Convert a canonical-SI value for display: `{ value, unit, dp }`. */
      convert: (v, unit) => convertRaw(v, unit, system),
      /** Convert and format: `{ text, unit, missing }`. */
      format: (v, unit, dp) => formatRaw(v, unit, system, dp),
    }),
    [system, choose, storageFailed],
  )

  return <UnitsContext.Provider value={value}>{children}</UnitsContext.Provider>
}
