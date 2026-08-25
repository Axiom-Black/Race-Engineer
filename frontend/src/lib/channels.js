// ByteCraft Racing — channel inventory: filtering, counting, formatting.
//
// The inventory is the honest record of what the export actually contained:
// 70 channels on a real LMU GTE session, some of them genuinely empty. It used
// to live at the bottom of the Summary tab, below the lap table, where finding
// one channel meant scrolling past everything else. It is now its own tab
// (Channels), which is what makes searching worth having.
//
// Logic lives here rather than in the component so that "does the filter
// actually find Brake Temp RL" is answerable without a DOM.

/**
 * Number(), minus the coercions that fabricate a measurement.
 *
 * `Number(null)` is 0 and `Number('')` is 0 — both finite, both wrong here. A
 * channel whose min came back null would otherwise render "0.00 … 245.98",
 * showing a floor that was never recorded. Caught by a test, not by review.
 */
function strictNum(v) {
  if (v === null || v === undefined || v === '') return NaN
  return Number(v)
}

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
export function formatRange(c) {
  if (!c || c.allZero) return null
  const min = strictNum(c.min)
  const max = strictNum(c.max)
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null
  const unit = c.unit ? ` ${c.unit}` : ''
  return `${min.toFixed(2)} … ${max.toFixed(2)}${unit}`
}

/** Logging rate as displayed, or null when the export did not record one. */
export function formatRate(c) {
  const hz = Number(c?.sampleRateHz)
  return Number.isFinite(hz) && hz > 0 ? `${hz} Hz` : null
}
