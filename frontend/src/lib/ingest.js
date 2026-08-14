// ByteCraft Racing — session ingest pipeline (S5 back half).
// Pure parse+summarize logic, kept separate from Supabase I/O (lib/sessions.js)
// so it's unit-testable against the fixture the same way the S3 parsers are.
//
// Data contract frozen in docs/s5-implementation-plan.md: each lap resamples
// to ~400 points along normalized TRACK DISTANCE (not time). Distance
// alignment is what lets two laps of different duration overlay meaningfully
// on the Track Map (S6) and a lap-vs-lap delta trace (S8) — resampling by
// time (the first pass of this file) would put point 200 of a 90 s lap and
// point 200 of a 95 s lap at different points on track, which breaks both.
//
// Standing bars this file exists to satisfy:
//   - Three-file upload is atomic: callers must have all three buffers before
//     calling parseSessionFiles; there is no partial-file code path here.
//   - Unreliable data is flagged, never hidden: every channel keeps its
//     `reliable`/`allZero` flags all the way into the persisted summary.
//   - Setup source priority: .ldx first (pre-decoded units), .svm sections
//     carried alongside as the fallback for the known truncation bug.
import { parseLd, decodeAll, lapBoundaries } from './motec/ld'
import { parseLdx, setupSummary } from './motec/ldx'
import { parseSvm, vehicleInfo, energyScheme } from './motec/svm'
import { domainOf } from './motec/domain'

const TARGET_POINTS_PER_LAP = 400
const WHEEL_CHANNELS = ['FL', 'FR', 'RL', 'RR']
// Ground Speed below this (km/h) makes slip ratio numerically meaningless
// (division by ~0) without being a real grip event — clamp to 0 instead.
const SLIP_MIN_SPEED_KMH = 5

async function sha256Hex(bytesOrText) {
  const bytes =
    typeof bytesOrText === 'string' ? new TextEncoder().encode(bytesOrText) : bytesOrText
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function nearestSample(ch, t) {
  if (!ch || !ch.samples.length) return null
  const idx = Math.min(ch.samples.length - 1, Math.max(0, Math.round(t * (ch.sampleRateHz || 1))))
  return ch.samples[idx]
}

/**
 * Single-pass min/max. `Math.min(...arr)` / `Math.max(...arr)` spread the whole
 * array onto the call stack and throw `RangeError: Maximum call stack size
 * exceeded` once it exceeds ~100k elements — which a real multi-lap/endurance
 * export reaches on a single 50 Hz channel. The truncated fixture (300 samples)
 * never hits it, so this must be verified against real files, not the fixture.
 */
export function extent(arr) {
  let min = Infinity
  let max = -Infinity
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i]
    if (v < min) min = v
    if (v > max) max = v
  }
  return arr.length ? { min, max } : { min: null, max: null }
}

/** Build the per-channel inventory persisted as sessions.summary.channels. */
function buildChannelSummary(ld) {
  return Object.values(ld.channels)
    .map((ch) => {
      const { min, max } = extent(ch.samples)
      return {
        name: ch.name,
        unit: ch.unit,
        domain: domainOf(ch.name),
        sampleRateHz: ch.sampleRateHz,
        sampleCount: ch.sampleCount,
        min,
        max,
        reliable: ch.reliable,
        allZero: ch.allZero,
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Per-lap channel summary (min/max/avg + which channels were empty/
 * unreliable). `startS`/`endS` are lap-relative seconds; each channel's
 * OWN sample rate converts them to that channel's index range — channels
 * differ in Hz (GPS ~5, Ground Speed ~20, Engine RPM ~50), so a shared
 * index space (as opposed to a shared time range) would misslice everything
 * but the master clock.
 */
function buildLapChannelSummary(ld, startS, endS) {
  const out = { channels: {}, emptyChannels: [], unreliableChannels: [] }
  for (const ch of Object.values(ld.channels)) {
    const rate = ch.sampleRateHz || 1
    const i0 = Math.max(0, Math.floor(startS * rate))
    const i1 = endS == null ? ch.samples.length : Math.min(ch.samples.length, Math.floor(endS * rate))
    const values = ch.samples.slice(i0, i1)
    if (!values.length) continue
    const { min, max } = extent(values)
    out.channels[ch.name] = {
      min,
      max,
      avg: Number((values.reduce((a, v) => a + v, 0) / values.length).toFixed(4)),
    }
    if (ch.allZero) out.emptyChannels.push(ch.name)
    if (!ch.reliable) out.unreliableChannels.push(ch.name)
  }
  return out
}

/**
 * Integrate Ground Speed (km/h) over time to get cumulative track distance
 * (m) across a sample index range at Ground Speed's own rate. Rectangular
 * integration is adequate at typical MoTeC rates (10-50 Hz) for a ~400-pt
 * downsample target.
 */
function cumulativeDistance(speedSamples, rateHz) {
  const dt = 1 / (rateHz || 1)
  const cum = new Array(speedSamples.length)
  let acc = 0
  for (let i = 0; i < speedSamples.length; i++) {
    acc += (speedSamples[i] / 3.6) * dt // km/h -> m/s
    cum[i] = acc
  }
  return cum
}

/**
 * Resample one lap to ~400 points evenly spaced by normalized track
 * distance (d: 0 -> 1), matching the prototype SessionReport `pts` shape.
 * GPS x/y are normalized against the SESSION-WIDE bounding box (passed in)
 * so every lap's points share one consistent map projection.
 */
function buildLapPoints(ld, startS, endS, gpsBounds) {
  const master = ld.channels['Ground Speed']
  if (!master || !master.samples.length) return { pts: [], distanceM: 0 }

  const rate = master.sampleRateHz || 1
  const i0 = Math.floor(startS * rate)
  const i1 = endS == null ? master.samples.length : Math.min(master.samples.length, Math.floor(endS * rate))
  if (i1 <= i0) return { pts: [], distanceM: 0 }

  const speedSlice = master.samples.slice(i0, i1)
  const cumDist = cumulativeDistance(speedSlice, rate)
  const totalDist = cumDist[cumDist.length - 1] || 0

  const wheelChannels = WHEEL_CHANNELS.map((w) => ld.channels[`Wheel Rot Speed ${w}`])
  const { lonMin, lonMax, latMin, latMax } = gpsBounds
  const lonSpan = lonMax - lonMin || 1
  const latSpan = latMax - latMin || 1

  const pts = []
  let searchFrom = 0
  const n = totalDist > 0 ? TARGET_POINTS_PER_LAP : 1
  for (let k = 0; k < n; k++) {
    const targetDist = (k / Math.max(1, n - 1)) * totalDist
    // cumDist is monotonically non-decreasing; walk forward from the last
    // match instead of re-scanning from 0 each time.
    while (searchFrom < cumDist.length - 1 && cumDist[searchFrom] < targetDist) searchFrom++
    const localIdx = searchFrom
    const globalIdx = i0 + localIdx
    const t = globalIdx / rate

    const speed = master.samples[globalIdx]
    const lon = nearestSample(ld.channels['GPS Longitude'], t)
    const lat = nearestSample(ld.channels['GPS Latitude'], t)
    const sl = wheelChannels.map((wc) => {
      const wheelSpeed = nearestSample(wc, t)
      if (wheelSpeed == null || speed == null || speed < SLIP_MIN_SPEED_KMH) return 0
      return Number((((wheelSpeed - speed) / speed) * 100).toFixed(2))
    })

    pts.push({
      x: lon != null ? Number(((lon - lonMin) / lonSpan).toFixed(4)) : null,
      y: lat != null ? Number(((lat - latMin) / latSpan).toFixed(4)) : null,
      s: speed != null ? Number(speed.toFixed(2)) : null,
      t: round1(nearestSample(ld.channels['Throttle Pos'], t)),
      b: round1(nearestSample(ld.channels['Brake Pos'], t)),
      g: nearestSample(ld.channels['Gear'], t),
      gl: round2(nearestSample(ld.channels['G Force Lat'], t)),
      glo: round2(nearestSample(ld.channels['G Force Long'], t)),
      r: nearestSample(ld.channels['Engine RPM'], t),
      sl,
      d: Number((k / Math.max(1, n - 1)).toFixed(4)),
    })
  }
  return { pts, distanceM: totalDist }
}

function round1(v) {
  return v == null ? null : Number(v.toFixed(1))
}
function round2(v) {
  return v == null ? null : Number(v.toFixed(2))
}

/** Session-wide GPS bounding box, so every lap normalizes against one map. */
function sessionGpsBounds(ld) {
  const lons = ld.channels['GPS Longitude']?.samples ?? []
  const lats = ld.channels['GPS Latitude']?.samples ?? []
  if (!lons.length || !lats.length) return { lonMin: 0, lonMax: 1, latMin: 0, latMax: 1 }
  const lon = extent(lons)
  const lat = extent(lats)
  return { lonMin: lon.min, lonMax: lon.max, latMin: lat.min, latMax: lat.max }
}

/** Parse "dd/mm/yyyy" + "HH:MM:SS" (.ld header format) into an ISO timestamp. */
function parseRecordedAt(dateStr, timeStr) {
  if (!dateStr) return null
  const [d, m, y] = dateStr.split('/').map(Number)
  if (!d || !m || !y) return null
  const [hh = 0, mm = 0, ss = 0] = (timeStr || '').split(':').map(Number)
  return new Date(Date.UTC(y, m - 1, d, hh, mm, ss)).toISOString()
}

/**
 * Parse a matched .ld/.ldx/.svm triple into everything a session row + trace
 * blob needs. Throws if any file fails to parse — callers must not persist a
 * partial result (three_file_atomicity is enforced again at the DB layer).
 */
export async function parseSessionFiles({ ldBytes, ldxText, svmText }) {
  const ld = parseLd(ldBytes)
  decodeAll(ldBytes, ld)
  const ldx = parseLdx(ldxText)
  const svm = parseSvm(svmText)

  const { car, carClass, ruleset } = vehicleInfo(svm)
  const gpsBounds = sessionGpsBounds(ld)
  const bounds = lapBoundaries(ld)

  const laps = []
  const tracePts = []
  let maxDistanceM = 0

  bounds.forEach((b, i) => {
    const next = bounds[i + 1]
    const endS = next?.startS ?? null
    const lapTimeS = endS != null ? Number((endS - b.startS).toFixed(3)) : null

    const { pts, distanceM } = buildLapPoints(ld, b.startS, endS, gpsBounds)
    maxDistanceM = Math.max(maxDistanceM, distanceM)

    laps.push({
      lapNo: b.lap,
      lapTimeS,
      valid: lapTimeS != null,
      summary: buildLapChannelSummary(ld, b.startS, endS),
    })
    tracePts.push({ lap: b.lap, time: lapTimeS, pts })
  })

  const lons = ld.channels['GPS Longitude']?.samples ?? []
  const lats = ld.channels['GPS Latitude']?.samples ?? []
  const lonE = extent(lons)
  const latE = extent(lats)
  const lonSpanDeg = (lons.length ? lonE.max - lonE.min : 0) || 1
  const latSpanDeg = (lats.length ? latE.max - latE.min : 0) || 1

  return {
    ldSha256: await sha256Hex(ldBytes),
    ldxSha256: await sha256Hex(ldxText),
    svmSha256: await sha256Hex(svmText),
    venue: ld.header.venue || null,
    driver: ld.header.driver || null,
    car,
    carClass,
    ruleset,
    recordedAt: parseRecordedAt(ld.header.date, ld.header.time),
    lengthKm: maxDistanceM > 0 ? Number((maxDistanceM / 1000).toFixed(3)) : null,
    lapCount: ldx.totalLaps,
    fastestLapNo: ldx.fastestLap,
    fastestLapS: ldx.fastestTimeS,
    energyScheme: energyScheme(svm),
    laps,
    trace: {
      aspect: Number((lonSpanDeg / latSpanDeg).toFixed(4)),
      laps: tracePts,
    },
    summary: {
      totalLaps: ldx.totalLaps,
      fastestLap: ldx.fastestLap,
      fastestTimeS: ldx.fastestTimeS,
      fastestTimeRaw: ldx.fastestTimeRaw,
      channels: buildChannelSummary(ld),
    },
    setup: {
      // .ldx is pre-decoded to engineering units and is the preferred source;
      // MoTeC truncates some values in the .ldx export (e.g. BrakePressure),
      // so the raw .svm sections travel alongside as the fallback source.
      ldx: setupSummary(ldx),
      truncatedKeys: Object.entries(ldx.setup)
        .filter(([, v]) => v.truncated)
        .map(([k]) => k),
      svmSections: svm.sections,
    },
  }
}
