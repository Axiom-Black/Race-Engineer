// MoTeC .ldx parser — the XML companion to a .ld telemetry file.
// JS port of the verified Python reference (backend/app/ingest/ldx.py).
//
// The .ldx yields (1) a session summary (total laps, fastest lap/time) and
// (2) a setup snapshot ALREADY in engineering units — the preferred setup
// source. It does NOT contain per-lap boundaries (those come from the .ld).
//
// Implementation note: the .ldx is flat, machine-generated XML of
// self-closing <String/> and <Numeric/> elements, so this module extracts
// attributes with a small scanner instead of DOMParser — identical behavior
// in the browser and in Node (Vitest) with zero dependencies. The golden
// master (fixtures/golden_master_ldx.json) is the correctness contract.

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" };

function decodeEntities(s) {
  return s.replace(/&(?:amp|lt|gt|quot|apos);/g, (m) => ENTITIES[m]);
}

/** Convert a MoTeC time string like '2:15.475' or '15.475' to seconds. */
export function timeToSeconds(text) {
  if (!text) return null;
  const t = String(text);
  if (t.includes(':')) {
    const [mins, rest] = t.split(/:(.*)/s);
    const m = parseInt(mins, 10);
    const r = Number(rest);
    if (Number.isNaN(m) || Number.isNaN(r) || rest.trim() === '') return null;
    return m * 60 + r;
  }
  const v = Number(t);
  return t.trim() === '' || Number.isNaN(v) ? null : v;
}

function toFloat(text) {
  if (text == null || String(text).trim() === '') return null;
  const v = Number(text);
  return Number.isNaN(v) ? null : v;
}

const DIGITS_ONLY = /^\d+$/;

/**
 * Parse the contents of a .ldx file.
 * Returns { totalLaps, fastestLap, fastestTimeS, fastestTimeRaw, setup }
 * where setup maps key -> { key, value, unit, numeric, truncated }.
 * Throws on malformed input (no <Details> block).
 */
export function parseLdx(rawXml) {
  if (typeof rawXml !== 'string' || !/<Details[\s>]/.test(rawXml)) {
    throw new Error('.ldx has no <Details> element');
  }

  const data = {
    totalLaps: null,
    fastestLap: null,
    fastestTimeS: null,
    fastestTimeRaw: null,
    setup: {},
  };

  const elementRe = /<(String|Numeric)\b([^>]*?)\/>/g;
  const attrRe = /([A-Za-z_][\w.-]*)\s*=\s*"([^"]*)"/g;

  let m;
  while ((m = elementRe.exec(rawXml)) !== null) {
    const tag = m[1];
    const attrs = {};
    let a;
    while ((a = attrRe.exec(m[2])) !== null) attrs[a[1]] = decodeEntities(a[2]);

    if (tag === 'String') {
      const sid = attrs.Id ?? '';
      const val = attrs.Value ?? '';
      if (sid === 'Total Laps') {
        data.totalLaps = DIGITS_ONLY.test(val) ? parseInt(val, 10) : null;
      } else if (sid === 'Fastest Lap') {
        data.fastestLap = DIGITS_ONLY.test(val) ? parseInt(val, 10) : null;
      } else if (sid === 'Fastest Time') {
        data.fastestTimeRaw = val;
        data.fastestTimeS = timeToSeconds(val);
      }
    } else {
      const nid = attrs.Id ?? '';
      if (!nid.startsWith('_Setup_')) continue;
      const key = nid.slice('_Setup_'.length);
      const value = attrs.Value ?? '';
      const unit = attrs.Unit ?? '';
      // MoTeC truncation bug: '(' with no matching ')' signals a cut value.
      const truncated = value.includes('(') && !value.includes(')');
      data.setup[key] = { key, value, unit, numeric: toFloat(value), truncated };
    }
  }

  return data;
}

/**
 * Flatten the setup into a compact { key: "value unit" } dict.
 * Skips N/A / empty / detached entries (token discipline for agent context).
 * Mirrors Python setup_summary().
 */
export function setupSummary(ldx) {
  const skip = new Set(['N/A', '0', 'Detached', 'Non-adjustable']);
  const out = {};
  for (const [key, sv] of Object.entries(ldx.setup)) {
    const v = sv.value.trim();
    if (!v || skip.has(v)) continue;
    out[key] = `${v} ${sv.unit}`.trim();
  }
  return out;
}
