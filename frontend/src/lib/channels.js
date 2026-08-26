// ByteCraft Racing — channel inventory: filtering, counting, formatting.
//
// The inventory is the honest record of what the export actually contained:
// 70 channels on a real LMU GTE session, some of them genuinely empty. It used
// to live at the bottom of the Summary tab, below the lap table, where finding
// one channel meant scrolling past everything else. It is now its own tab
// (Channels), which is what makes searching worth having.
//
import { convert, DEFAULT_SYSTEM } from './units.js'

// Logic lives here rather than in the component so that "does the filter
// actually find Brake Temp RL" is answerable without a DOM.

/** Every domain present, 'All' first, the rest alphabetical. */
export function domainsOf(channels) {
  if (!Array.isArray(channels)) return ['All']
  const seen = new Set()
  for (const c of channels) if (c?.domain) seen.add(c.domain)
  return ['All', ...Array.from(seen).sort()]
}

/**
 * Filter by domain and a free-text name query.
 *
 * The query is matched case-insensitively as a substring, deliberately: a
 * driver hunting "brake" should find `Brake Pos`, `Brake Temp FL` and
 * `Brake Bias Rear` in one go. Whitespace-only input is treated as no query
 * rather than as a search for a space, which would match nothing and read as
 * a broken filter.
 */
export function filterChannels(channels, { domain = 'All', query = '' } = {}) {
  if (!Array.isArray(channels)) return []
  const q = String(query ?? '').trim().toLowerCase()
  return channels.filter((c) => {
    if (!c) return false
    if (domain !== 'All' && c.domain !== domain) return false
    if (q && !String(c.name ?? '').toLowerCase().includes(q)) return false
    return true
  })
}

/**
 * Headline counts for the inventory.
 *
 * `flagged` is the union, not the sum: a channel can in principle be both
 * all-zero and unreliable, and counting it twice would report more flagged
 * channels than exist.
 */
export function channelStats(channels) {
  const list = Array.isArray(channels) ? channels.filter(Boolean) : []
  const empty = list.filter((c) => c.allZero).length
  const unreliable = list.filter((c) => c.reliable === false).length
  const flagged = list.filter((c) => c.allZero || c.reliable === false).length
  return { total: list.length, empty, unreliable, flagged }
}

/**
 * The min…max range as displayed.
 *
 * An all-zero channel returns null rather than "0.00 … 0.00": the range is
 * real but meaningless, and printing it invites a driver to read a measurement
 * where there is none (WORKING_PLAN §4 — flagged, never hidden).
 */
export function formatRange(c, system = DEFAULT_SYSTEM) {
  if (!c || c.allZero) return null
  const lo = convert(c.min, c.unit, system)
  const hi = convert(c.max, c.unit, system)
  if (lo.value === null || hi.value === null) return null
  // The channel's OWN unit drives the conversion, so the whole 70-channel
  // inventory follows the preference without a per-field mapping — and a unit
  // we do not know passes through in SI rather than being silently mis-scaled.
  const dp = Math.max(lo.dp, 2)
  const unit = lo.unit ? ` ${lo.unit}` : ''
  return `${lo.value.toFixed(dp)} … ${hi.value.toFixed(dp)}${unit}`
}

/** Logging rate as displayed, or null when the export did not record one. */
export function formatRate(c) {
  const hz = Number(c?.sampleRateHz)
  return Number.isFinite(hz) && hz > 0 ? `${hz} Hz` : null
}
