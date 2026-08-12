// ByteCraft Racing — session ingest (S5 · Step 2).
//
// Pure transform from the three raw MoTeC buffers to what the pilot
// persists: a session header, per-lap summaries, and a distance-resampled
// trace blob. Builds entirely on the golden-tested S3 parsers in ../motec —
// it introduces NO new decode assumptions (standing bar: parsers grounded in
// real files). No DB, no network, no React here — Step 3 wires this to
// Supabase.
//
// Decisions (docs/S5_IMPLEMENTATION_PLAN.md): traces are downsampled by
// track DISTANCE to `points` samples/lap so laps align for the Track Map,
// progression, and the S8 overlay. Lap windows come from the .ld Lap Number
// channel (the .ldx carries only a summary). Empty/unreliable channels are
// reported, never fabricated.

import { parseLd, decodeAll, lapBoundaries, KNOWN_EMPTY_FOR_SOME_CARS } from '../motec/ld.js'
import { parseLdx, setupSummary } from '../motec/ldx.js'
import { parseSvm, vehicleInfo, energyScheme } from '../motec/svm.js'

export const DEFAULT_POINTS = 400

// Trace point key → source channel. Only channels with real backing in LMU
// exports. (Slip is intentionally absent — there is no slip channel and Grip
// Fract is empty for GTE; SessionReport renders that as EMPTY, never faked.)
const TRACE_MAP = {
  s: 'Ground Speed',
  t: 'Throttle Pos',
  b: 'Brake Pos',
  g: 'Gear',
  gl: 'G Force Lat',
  glo: 'G Force Long',
  r: 'Engine RPM',
}
const CH_SPEED = 'Ground Speed'
const CH_LAT = 'GPS Latitude'
const CH_LON = 'GPS Longitude'

// ── small numeric helpers ─────────────────────────────────────────
/** Latest sample time across all channels — the session's true end. */
function sessionEndSeconds(chans) {
  let end = 0
  for (const ch of Object.values(chans)) {
    const dur = ch.samples.length / (ch.sampleRateHz || 1)
    if (dur > end) end = dur
  }
  return end
}

/** Linear-interpolate a channel's value at time t, clamped to its range. */
function sampleAt(ch, t) {
  if (!ch || !ch.samples.length) return null
  const rate = ch.sampleRateHz || 1
  const n = ch.samples.length
  const x = t * rate // fractional sample index
  if (x <= 0) return ch.samples[0]
  if (x >= n - 1) return ch.samples[n - 1]
  const i = Math.floor(x)
  const f = x - i
  return ch.samples[i] * (1 - f) + ch.samples[i + 1] * f
}

/** min / max / mean over a channel's samples whose time falls in [t0, t1). */
function windowStats(ch, t0, t1) {
  if (!ch || !ch.samples.length) return null
  const rate = ch.sampleRateHz || 1
  const i0 = Math.max(0, Math.ceil(t0 * rate))
  const i1 = Math.min(ch.samples.length - 1, Math.floor(t1 * rate))
  if (i1 < i0) {
    // Window shorter than one sample interval — fall back to the value at t0.
    const v = sampleAt(ch, t0)
    return v == null ? null : { min: v, max: v, avg: v, unit: ch.unit }
  }
  let min = Infinity
  let max = -Infinity
  let sum = 0
  let count = 0
  for (let i = i0; i <= i1; i++) {
    const v = ch.samples[i]
    if (v < min) min = v
    if (v > max) max = v
    sum += v
    count++
  }
  return { min, max, avg: sum / count, unit: ch.unit }
}

/**
 * Cumulative distance (metres) vs the Ground Speed timeline, by trapezoid.
 * Returns { t: number[], cum: number[] } aligned to Ground Speed samples.
 */
function distanceProfile(speedCh) {
  const rate = speedCh.sampleRateHz || 1
  const v = speedCh.samples
  const t = new Array(v.length)
  const cum = new Array(v.length)
  t[0] = 0
  cum[0] = 0
  for (let i = 1; i < v.length; i++) {
    const dt = 1 / rate
    // km/h → m/s = /3.6; trapezoid on speed.
    const seg = ((v[i - 1] + v[i]) / 2 / 3.6) * dt
    t[i] = i / rate
    cum[i] = cum[i - 1] + Math.max(0, seg)
  }
  return { t, cum }
}

/** Distance travelled between times t0..t1 from a cumulative profile. */
function cumAtTime(profile, tq) {
  const { t, cum } = profile
  if (tq <= t[0]) return cum[0]
  if (tq >= t[t.length - 1]) return cum[cum.length - 1]
  // t is uniform; locate the bracket directly.
  const rate = (t.length - 1) / (t[t.length - 1] - t[0])
  const x = (tq - t[0]) * rate
  const i = Math.floor(x)
  const f = x - i
  return cum[i] * (1 - f) + cum[i + 1] * f
}

/** Invert the cumulative profile: earliest time within [t0,t1] at target metres. */
function timeAtCum(profile, target, t0, t1) {
  const { t, cum } = profile
  // Binary-search the uniform arrays for the bracket, then interpolate time.
  let lo = 0
  let hi = t.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (cum[mid] < target) lo = mid + 1
    else hi = mid
  }
  let tq
  if (lo === 0) tq = t[0]
  else {
    const c0 = cum[lo - 1]
    const c1 = cum[lo]
    const f = c1 === c0 ? 0 : (target - c0) / (c1 - c0)
    tq = t[lo - 1] + (t[lo] - t[lo - 1]) * f
  }
  return Math.min(t1, Math.max(t0, tq))
}

// ── hashing (dedup keys) ──────────────────────────────────────────
function hex(buf) {
  const b = new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, '0')
  return s
}

async function sha256Hex(input) {
  const bytes =
    typeof input === 'string'
      ? new TextEncoder().encode(input)
      : input instanceof Uint8Array
        ? input
        : new Uint8Array(input)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return hex(digest)
}

function prettyCar(raw) {
  return raw ? raw.replace(/_/g, ' ') : null
}

// ── main ──────────────────────────────────────────────────────────
/**
 * Ingest a three-file MoTeC set into persistable shapes.
 *
 * @param {Uint8Array|ArrayBuffer} ldBuf  raw .ld bytes
 * @param {string} ldxText                raw .ldx XML
 * @param {string} svmText                raw .svm text
 * @param {{points?: number}} [opts]
 * @returns {Promise<{session, laps, trace}>}
 */
export async function ingest(ldBuf, ldxText, svmText, opts = {}) {
  const points = opts.points ?? DEFAULT_POINTS
  const ldBytes = ldBuf instanceof Uint8Array ? ldBuf : new Uint8Array(ldBuf)

  // 1 — decode everything (golden-tested parsers).
  const ld = parseLd(ldBytes)
  decodeAll(ldBytes, ld)
  const ldx = parseLdx(ldxText)
  const svm = parseSvm(svmText)
  const vehicle = vehicleInfo(svm)

  const chans = ld.channels
  const speed = chans[CH_SPEED]
  const lat = chans[CH_LAT]
  const lon = chans[CH_LON]

  // 2 — lap windows: starts from the .ld Lap Number boundaries; the final
  // lap runs to the session end (latest sample across all channels), so a
  // session with no lap markers (Lap Number all-zero) still covers its full
  // data rather than being clipped to the Lap Number channel's own length.
  const bounds = lapBoundaries(ld) // [{lap, startS}], at least one entry
  const sessionEnd = sessionEndSeconds(chans)
  const windows = bounds.map((b, i) => ({
    lapNo: b.lap,
    t0: b.startS,
    t1: i + 1 < bounds.length ? bounds[i + 1].startS : sessionEnd,
  }))

  // 3 — distance profile + GPS bounding box (whole session).
  const profile = speed && speed.samples.length ? distanceProfile(speed) : null
  const gps = gpsBounds(lat, lon)

  // 4 — per-lap: summaries + distance-resampled trace.
  const laps = []
  const traceLaps = []
  for (const w of windows) {
    const dur = Math.max(0, w.t1 - w.t0)
    const distM = profile ? cumAtTime(profile, w.t1) - cumAtTime(profile, w.t0) : 0

    // Per-channel summary over the lap window.
    const channels = {}
    const empty = []
    for (const [name, ch] of Object.entries(chans)) {
      if (ch.allZero) empty.push(name)
      const st = windowStats(ch, w.t0, w.t1)
      if (st) channels[name] = st
    }

    laps.push({
      lapNo: w.lapNo,
      lapTimeS: round3(dur),
      lengthM: Math.round(distM),
      valid: true,
      summary: { channels, empty },
    })

    // Trace points evenly spaced by distance (or by time if the car never moved).
    const pts = []
    const byDistance = profile && distM > 1
    for (let k = 0; k < points; k++) {
      const d = points === 1 ? 0 : k / (points - 1)
      const tq = byDistance
        ? timeAtCum(profile, cumAtTime(profile, w.t0) + d * distM, w.t0, w.t1)
        : w.t0 + d * dur
      const p = { d: round4(d), ms: Math.round(tq * 1000) }
      for (const [key, chName] of Object.entries(TRACE_MAP)) {
        const v = sampleAt(chans[chName], tq)
        if (v != null) p[key] = round3(v)
      }
      const [x, y] = gps ? gps.normAt(tq) : [null, null]
      if (x != null) {
        p.x = round4(x)
        p.y = round4(y)
      }
      pts.push(p)
    }
    traceLaps.push({ lapNo: w.lapNo, timeS: round3(dur), pts })
  }

  // 5 — fastest lap + session-level rollups.
  const timed = laps.filter((l) => l.lapTimeS > 0)
  const fastest = timed.reduce(
    (best, l) => (best == null || l.lapTimeS < best.lapTimeS ? l : best),
    null,
  )
  const emptyChannels = Object.entries(chans)
    .filter(([, ch]) => ch.allZero)
    .map(([n]) => n)
  const unreliableChannels = Object.entries(chans)
    .filter(([, ch]) => ch.reliable === false)
    .map(([n]) => n)

  const [ldSha256, ldxSha256, svmSha256] = await Promise.all([
    sha256Hex(ldBytes),
    sha256Hex(ldxText),
    sha256Hex(svmText),
  ])

  const session = {
    venue: ld.header.venue || null,
    driver: ld.header.driver || null,
    car: prettyCar(vehicle.car),
    carClass: vehicle.carClass,
    ruleset: vehicle.ruleset,
    recordedAt: parseHeaderDate(ld.header),
    energyScheme: energyScheme(svm),
    lengthKm: fastest ? round3(fastest.lengthM / 1000) : null,
    lapCount: laps.length,
    fastestLapNo: fastest ? fastest.lapNo : null,
    fastestLapS: fastest ? fastest.lapTimeS : null,
    emptyChannels,
    knownEmptyForClass: emptyChannels.filter((n) => KNOWN_EMPTY_FOR_SOME_CARS.has(n)),
    unreliableChannels,
    setup: setupSummary(ldx),
    ldxFastestLap: ldx.fastestLap,
    ldxFastestTimeS: ldx.fastestTimeS,
    ldSha256,
    ldxSha256,
    svmSha256,
  }

  const trace = {
    points,
    aspect: gps ? gps.aspect : null,
    channels: Object.keys(TRACE_MAP),
    laps: traceLaps,
  }

  return { session, laps, trace }
}

// ── header date, GPS box ──────────────────────────────────────────
/** MoTeC header carries "dd/mm/yyyy" + "HH:MM:SS"; combine to an ISO string. */
function parseHeaderDate(header) {
  const d = (header.date || '').trim()
  const t = (header.time || '').trim()
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(d)
  if (!m) return null
  const iso = `${m[3]}-${m[2]}-${m[1]}T${/^\d{2}:\d{2}:\d{2}$/.test(t) ? t : '00:00:00'}`
  return iso
}

function gpsBounds(lat, lon) {
  if (!lat || !lon || !lat.samples.length || !lon.samples.length) return null
  let latMin = Infinity
  let latMax = -Infinity
  let lonMin = Infinity
  let lonMax = -Infinity
  for (const v of lat.samples) {
    if (v < latMin) latMin = v
    if (v > latMax) latMax = v
  }
  for (const v of lon.samples) {
    if (v < lonMin) lonMin = v
    if (v > lonMax) lonMax = v
  }
  const latSpan = latMax - latMin || 1
  const lonSpan = lonMax - lonMin || 1
  return {
    aspect: round4(latSpan / lonSpan),
    normAt(t) {
      const la = sampleAt(lat, t)
      const lo = sampleAt(lon, t)
      if (la == null || lo == null) return [null, null]
      return [(lo - lonMin) / lonSpan, (la - latMin) / latSpan]
    },
  }
}

const round3 = (v) => Math.round(v * 1e3) / 1e3
const round4 = (v) => Math.round(v * 1e4) / 1e4
