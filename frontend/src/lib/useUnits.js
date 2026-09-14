// ByteCraft Racing — reading the unit system.
//
// Split from unitsContext.jsx purely so that file exports only components:
// Fast Refresh cannot reload a module that mixes a component with a hook, and
// losing hot reload on the provider means losing it on the whole app.
import { useContext } from 'react'
import { UnitsContext } from './unitsStore.js'
import { convert as convertRaw, format as formatRaw, DEFAULT_SYSTEM } from './units.js'

/**
 * Read the unit system and its formatters.
 *
 * Falls back to a working metric formatter when used outside a provider, rather
 * than throwing. A component test that renders one card should not have to
 * assemble the whole app to get a number on screen — and a missing provider in
 * production should degrade to correct SI output, not a blank page.
 */
export function useUnits() {
  const ctx = useContext(UnitsContext)
  if (ctx) return ctx
  return {
    system: DEFAULT_SYSTEM,
    choose: () => {},
    storageFailed: false,
    convert: (v, unit) => convertRaw(v, unit, DEFAULT_SYSTEM),
    format: (v, unit, dp) => formatRaw(v, unit, DEFAULT_SYSTEM, dp),
  }
}
