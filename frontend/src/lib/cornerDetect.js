// ByteCraft Racing — corner detection from what the CAR did, at full rate.
//
// WHY THIS REPLACED GEOMETRY ON THE DOWNSAMPLED TRACE.
//
// lib/corners.js detected corners from the persisted trace: ~400 points per
// lap, GPS positions, Menger curvature. That capped detection at 12 corners on
// a twenty-corner circuit, and importance-weighted resampling only lifted it to
// 15. Both numbers are properties of OUR storage decision, not of the circuit —
// which makes them a bad foundation for a product that has to work on tracks
// nobody here has driven.
//
// The fix is not a better estimator. It is to stop reading the wrong channel at
// the wrong rate. Measured on the real COTA export:
//
//     GPS Latitude/Longitude ...  5 Hz   (~11 m at 200 km/h)
//     Ground Speed ............. 10 Hz
//     G Force Lat .............. 25 Hz   (~2.2 m at 200 km/h, <1 m in a corner)
//
// A corner is not a shape in a polyline — it is the car carrying lateral load.
// `G Force Lat` measures exactly that, at 25 Hz, which is **8.5x** the
// resolution of the persisted trace and needs no differentiation of noisy
// positions to recover. Detection runs at INGEST against that full-rate
// channel, and the result (about twenty small objects per lap) is persisted
// with the trace. Storage cost is negligible; the trace stays 400 points.
//
// RESULT ON THE REAL EXPORT: **20 corners on every lap of the session** — the
// out-lap and all three timed laps — against COTA's official 20, from
// geometry-free physics with no circuit-specific constant anywhere in this
// file. It is a plateau, not a knife-edge: `peakFrac` 0.50 through 0.60 and
// `onFrac` 0.15 through 0.25 all return the identical answer.
//
// EVERY THRESHOLD IS DIMENSIONLESS, WHICH IS WHAT MAKES IT TRAVEL.
//
// The load-bearing decision here is that no threshold is an absolute G number.
// "0.25 G" means a firm corner in an LMP3 and a rounding error in a Hypercar;
// "0.9 seconds" means one corner at Monaco and half a straight at Le Mans. So
// every level is expressed as a FRACTION of the session's lateral capability
// (the 97th percentile of |G_lat| — near the peak, but immune to a single
// kerb strike), and the splitting rule is a fraction of the *surrounding*
// peaks. A car with half the grip on a circuit with twice the corners gets the
// same answer, because every number scales with it.
//
// HOW A CORNER IS BOUNDED, in three steps:
//
//   1. RUNS. Contiguous samples where |G_lat| clears `onFrac` of capability,
//      broken whenever the sign flips — a left immediately followed by a right
//      is two corners, and this is what resolves an ess sequence that geometry
//      at 13 m smears into one arc.
//   2. MERGE, then REJECT. Same-direction runs separated by a brief release are
//      one corner. A run that never reaches `peakFrac` of capability is a
//      corner-exit tail, not a corner — the car is still unwinding, and
//      counting it would have added a phantom turn to most laps.
//   3. SPLIT. A sustained same-direction run is cut at an interior |G_lat|
//      minimum whose RELATIVE prominence clears `relProm` — the driver released
//      the car to below 65% of the flanking peaks and loaded it again, which is
//      a second turn however the circuit's owner numbers it. This is what
//      separates a double-apex complex without splitting one long constant
//      sweeper.
//
// The reject in step 2 is applied AGAIN to every fragment from step 3: a piece
// that never loaded the car is not a corner regardless of what it was cut from.
// Skipping that re-check left a 0.3-0.7 G fragment in most laps.
//
// WHAT THIS STILL CANNOT DO, AND MUST NOT PRETEND TO.
//
// It counts *cornering events*, and official numbering is a circuit-operator
// convention that no telemetry channel contains. Some circuits number a kink
// that generates no measurable load; others give one number to a complex the
// car clearly takes as two. The count matching COTA's 20 exactly on all three
// laps is strong evidence the physics is right — but it is one circuit, one
// car, one driver, so the numbering stays labelled as ours until the curated
// registry lands in Phase 3. See docs/phase-plan.md.
import { strictNum } from './num.js'

export const DETECT_DEFAULTS = {
  // Percentile of |G_lat| taken as the lap's lateral capability. Not the max:
  // one kerb strike or one bump would raise the bar for the whole lap.
  capPercentile: 0.97,
  // Box-smoothing half-width, in SECONDS, so a 25 Hz and a 50 Hz export get
  // the same physical filter. ±0.12 s measured best on the real lap; ±0.08 s
  // over-splits on noise and ±0.16 s starts merging real corners.
  smoothS: 0.12,
  // Fraction of capability at which the car counts as cornering. Deliberately
  // low — this only sets the corner's EDGES, and step 2 decides what is real.
  // Verified insensitive: 0.15 through 0.25 all give the same corner count.
  onFrac: 0.15,
  // Fraction of capability a corner must actually reach. This is the filter
  // that separates a corner from the tail of the one before it. 0.50 to 0.60
  // all give the identical answer on the real export, so 0.55 is the middle of
  // a plateau rather than a knife-edge.
  peakFrac: 0.55,
  // Same-direction runs separated by less than this are one corner.
  mergeS: 0.35,
  // A corner must last this long. Below it, a bump is a corner.
  minDurS: 0.4,
  // Relative release required to cut a sustained corner in two: the load must
  // drop to below (1 - relProm) of the lower flanking peak.
  relProm: 0.35,
  // ...and the two halves must each be at least this long, or a moment of
  // hesitation mid-corner reads as two turns.
  splitGapS: 0.9,
}

/** Box-smooth with prefix sums — one pass whatever the radius. */
export function smooth(series, radius) {
  const n = series.length
  if (!(radius > 0) || n === 0) return Array.from(series, (v) => strictNum(v) || 0)
  const prefix = new Float64Array(n + 1)
  for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i] + (strictNum(series[i]) || 0)
  const out = new Array(n)
  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, i - radius)
    const hi = Math.min(n - 1, i + radius)
    out[i] = (prefix[hi + 1] - prefix[lo]) / (hi - lo + 1)
  }
  return out
}

/**
 * The lap's lateral capability: a high percentile of |G_lat|.
 *
 * Every threshold in this module is a fraction of this, which is what lets one
 * parameter set serve an LMP3 at Monaco and a Hypercar at Le Mans.
 */
export function lateralCapability(gLat, percentile = DETECT_DEFAULTS.capPercentile) {
  const mags = []
  for (const v of gLat ?? []) {
    const n = strictNum(v)
    if (Number.isFinite(n)) mags.push(Math.abs(n))
  }
  if (mags.length === 0) return 0
  mags.sort((a, b) => a - b)
  const i = Math.min(mags.length - 1, Math.max(0, Math.floor(percentile * mags.length)))
  return mags[i]
}

/** Relative prominence of an interior minimum at `i` within `[lo, hi]`. */
function relativeProminence(s, i, lo, hi) {
  const a = Math.abs(s[i])
  let left = a
  let right = a
  for (let q = i; q >= lo && Math.abs(s[q]) >= a; q--) left = Math.max(left, Math.abs(s[q]))
  for (let q = i; q <= hi && Math.abs(s[q]) >= a; q++) right = Math.max(right, Math.abs(s[q]))
  const flank = Math.min(left, right)
  return flank > 0 ? (flank - a) / flank : 0
}

/**
 * Detect corners in one lap of lateral-G samples.
 *
 * @param {number[]} gLat   lateral G for the lap, at its own rate
 * @param {number} rateHz   that channel's sample rate
 * @param {object} [opts]   overrides for DETECT_DEFAULTS, plus `capability`:
 *   the SESSION-wide lateral capability. Pass it. Lateral grip is a property of
 *   the car and the circuit, not of one lap, and a lap where the driver never
 *   pushed — an in-lap, the trailing partial — has a low percentile of its own.
 *   Normalising that lap against itself promoted 0.19 G steering corrections
 *   into corners on the fixture's final fragment. Omitted, it falls back to the
 *   lap's own capability, which is right only when the lap is all there is.
 * @returns {Array<{startIdx:number, apexIdx:number, endIdx:number,
 *                  direction:'left'|'right', peakG:number}>}
 *          indices into `gLat`; `apexIdx` is the peak-load sample, which the
 *          caller is expected to refine to the slowest point using speed.
 */
export function detectCornersFromG(gLat, rateHz, opts = {}) {
  const o = { ...DETECT_DEFAULTS, ...opts }
  const rate = strictNum(rateHz)
  if (!Array.isArray(gLat) || gLat.length < 10 || !Number.isFinite(rate) || rate <= 0) return []

  const s = smooth(gLat, Math.max(1, Math.round(o.smoothS * rate)))
  const given = strictNum(o.capability)
  const cap = Number.isFinite(given) && given > 0 ? given : lateralCapability(s, o.capPercentile)
  // A lap with no lateral load at all — a pit lane, or an export whose G
  // channel is empty. There are no corners to find, and scaling by zero would
  // make every sample a corner.
  if (!(cap > 0)) return []

  const onLevel = o.onFrac * cap
  const needLevel = o.peakFrac * cap
  const mergeGap = Math.round(o.mergeS * rate)
  const minLen = Math.round(o.minDurS * rate)
  const splitGap = Math.round(o.splitGapS * rate)

  const peakOf = (r) => {
    let p = 0
    for (let k = r.startIdx; k <= r.endIdx; k++) p = Math.max(p, Math.abs(s[k]))
    return p
  }

  // 1 · Signed runs above the on-level. A sign flip ends a run: an ess is two
  //     corners, and this is the step geometry at 13 m could not do.
  const runs = []
  let cur = null
  for (let i = 0; i < s.length; i++) {
    const v = s[i]
    const sign = v > 0 ? 1 : -1
    if (Math.abs(v) >= onLevel) {
      if (cur && cur.sign === sign) cur.endIdx = i
      else {
        if (cur) runs.push(cur)
        cur = { startIdx: i, endIdx: i, sign }
      }
    } else if (cur) {
      runs.push(cur)
      cur = null
    }
  }
  if (cur) runs.push(cur)

  // 2 · Merge same-direction runs across a brief release, then reject anything
  //     that never actually loaded the car.
  const merged = []
  for (const r of runs) {
    const last = merged[merged.length - 1]
    if (last && last.sign === r.sign && r.startIdx - last.endIdx <= mergeGap) last.endIdx = r.endIdx
    else merged.push({ ...r })
  }
  const kept = merged.filter((r) => peakOf(r) >= needLevel)

  // 3 · Split a sustained corner where the driver released and reloaded.
  const split = []
  for (const r of kept) {
    const cuts = []
    for (let k = r.startIdx + 2; k < r.endIdx - 2; k++) {
      const a = Math.abs(s[k])
      if (!(a <= Math.abs(s[k - 1]) && a < Math.abs(s[k + 1]))) continue
      const rel = relativeProminence(s, k, r.startIdx, r.endIdx)
      if (rel < o.relProm) continue
      const last = cuts[cuts.length - 1]
      if (last && k - last.k < splitGap) {
        if (rel > last.rel) cuts[cuts.length - 1] = { k, rel }
      } else cuts.push({ k, rel })
    }
    let from = r.startIdx
    for (const c of cuts) {
      if (c.k - from >= splitGap && r.endIdx - c.k >= splitGap) {
        split.push({ startIdx: from, endIdx: c.k, sign: r.sign })
        from = c.k + 1
      }
    }
    split.push({ startIdx: from, endIdx: r.endIdx, sign: r.sign })
  }

  // The step-2 reject, applied AGAIN to every fragment. A piece that never
  // loaded the car is not a corner regardless of what it was cut from —
  // skipping this left a 0.3-0.7 G fragment in most laps.
  return split
    .filter((r) => r.endIdx - r.startIdx + 1 >= minLen && peakOf(r) >= needLevel)
    .map((r) => {
      let apexIdx = r.startIdx
      let peak = 0
      for (let k = r.startIdx; k <= r.endIdx; k++) {
        const a = Math.abs(s[k])
        if (a > peak) {
          peak = a
          apexIdx = k
        }
      }
      return {
        startIdx: r.startIdx,
        apexIdx,
        endIdx: r.endIdx,
        // Reported as left/right rather than as a sign, because the sign
        // convention of G Force Lat is an LMU fact and this is a driver-facing
        // word. Positive is taken as a right-hand corner.
        direction: r.sign > 0 ? 'right' : 'left',
        peakG: Number(peak.toFixed(2)),
      }
    })
}
