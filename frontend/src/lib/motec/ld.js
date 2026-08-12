// MoTeC .ld binary telemetry parser — LMU exports.
// JS port of the verified Python reference (backend/app/ingest/motec.py).
// Every offset was confirmed by byte inspection of a real LMU export; see
// docs/MoTeC_LD_format_findings.md and fixtures/FIXTURE_NOTES.md.
//
// DECODE FORMULA (complete — G1.1):
//
//     phys = raw * mul / (scale * 10^dec) + shift
//
// `scale` (offset 0x1C) is 1 for 67/70 channels but 50 for Ambient/Track
// Temperature and 9 for Steering Wheel Position. The earlier prototype JS
// parser omitted both `shift` and `scale` — this module supersedes it.
// Golden masters in fixtures/ are the arbiter (Ring 1 G1.2 / Ring 4 G4.1).

// Channels LMU exports but does not populate reliably. Empty since the
// 10 Aug 2026 scale fix (the temperature channels decode correctly now);
// kept as a hook for genuinely corrupted channels in future exports.
export const UNRELIABLE_CHANNELS = new Set([]);

export const KNOWN_EMPTY_FOR_SOME_CARS = new Set([
  'Tyre Load FL', 'Tyre Load FR', 'Tyre Load RL', 'Tyre Load RR',
  'Grip Fract FL', 'Grip Fract FR', 'Grip Fract RL', 'Grip Fract RR',
  'Battery Charge Level',
]);

// Header field offsets (confirmed by inspection)
const META_PTR_OFFSET = 0x08;
const DATE_OFFSET = 0x5e;
const TIME_OFFSET = 0x7e;
const DRIVER_OFFSET = 0x9e; // confirmed 0x9E, not 0xA0 — FIXTURE_NOTES §1
const VENUE_OFFSET = 0x15e;

// Channel metadata record — 124 bytes, singly linked
const REC_SIZE = 124;
const NEXT_PTR = 0x04;
const DATA_PTR = 0x08;
const SAMPLE_COUNT = 0x0c;
const DTYPE_SIZE = 0x14;
const SAMPLE_RATE = 0x16;
const SHIFT = 0x18;
const MUL = 0x1a;
const SCALE = 0x1c;
const DEC = 0x1e;
const NAME = 0x20;
const NAME_LEN = 32;
const UNIT = 0x48;
const UNIT_LEN = 12;

/** Read a NUL-terminated latin1 string of at most maxLen bytes, trimmed. */
function readStr(bytes, offset, maxLen) {
  let out = '';
  for (let i = 0; i < maxLen; i++) {
    const b = bytes[offset + i];
    if (b === 0 || b === undefined) break;
    out += String.fromCharCode(b); // byte value == latin1 code point
  }
  return out.trim();
}

function toBytes(data) {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  throw new TypeError('parseLd expects an ArrayBuffer or Uint8Array');
}

/**
 * Parse a .ld file's header and channel table.
 * Does NOT decode sample data — call decodeSamples() per channel, so a
 * caller who only wants the channel inventory pays nothing for samples.
 * Mirrors Python parse_ld() exactly.
 */
export function parseLd(data) {
  const bytes = toBytes(data);
  if (bytes.length < 0x200) {
    throw new Error(`.ld file too small (${bytes.length} bytes)`);
  }
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const metaPtr = dv.getUint32(META_PTR_OFFSET, true);
  if (!(metaPtr > 0 && metaPtr < bytes.length)) {
    throw new Error(`Invalid channel metadata pointer 0x${metaPtr.toString(16)}`);
  }

  const header = {
    date: readStr(bytes, DATE_OFFSET, 16),
    time: readStr(bytes, TIME_OFFSET, 16),
    driver: readStr(bytes, DRIVER_OFFSET, 32),
    venue: readStr(bytes, VENUE_OFFSET, 64),
  };

  const channels = {};
  let ptr = metaPtr;
  const seen = new Set();

  while (ptr && ptr > 0 && ptr < bytes.length && !seen.has(ptr)) {
    seen.add(ptr);
    if (ptr + REC_SIZE > bytes.length) break;

    const nextPtr = dv.getUint32(ptr + NEXT_PTR, true);
    const dataPtr = dv.getUint32(ptr + DATA_PTR, true);
    const nSamples = dv.getUint32(ptr + SAMPLE_COUNT, true);
    const dsize = dv.getUint16(ptr + DTYPE_SIZE, true);
    const rate = dv.getUint16(ptr + SAMPLE_RATE, true);
    const shift = dv.getInt16(ptr + SHIFT, true);
    const mul = dv.getInt16(ptr + MUL, true);
    const scale = dv.getInt16(ptr + SCALE, true);
    const dec = dv.getInt16(ptr + DEC, true);
    const name = readStr(bytes, ptr + NAME, NAME_LEN);
    const unit = readStr(bytes, ptr + UNIT, UNIT_LEN);

    if (name) {
      channels[name] = {
        name,
        unit,
        sampleRateHz: rate,
        sampleCount: nSamples,
        bytesPerSample: dsize === 1 || dsize === 2 || dsize === 4 ? dsize : 2,
        shift,
        mul: mul !== 0 ? mul : 1,
        scale: scale !== 0 ? scale : 1,
        dec,
        dataOffset: dataPtr,
        reliable: !UNRELIABLE_CHANNELS.has(name),
        allZero: false,
        samples: [],
      };
    }

    if (nextPtr === 0 || nextPtr === ptr) break;
    ptr = nextPtr;
  }

  return { header, channels };
}

/**
 * Decode a channel's raw samples to physical values:
 *   phys = raw * mul / (scale * 10^dec) + shift
 * Populates channel.samples and channel.allZero, returns the decoded array.
 * Mirrors Python decode_samples() exactly (int-only sample reads — no LMU
 * channel is float32; the 4-byte GPS pair is int32, FIXTURE_NOTES §4).
 */
export function decodeSamples(data, channel) {
  const bytes = toBytes(data);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  let n = channel.sampleCount;
  const size = channel.bytesPerSample;
  const start = channel.dataOffset;

  if (start + n * size > bytes.length) {
    // Truncated file — decode what exists, never read past the buffer.
    n = Math.max(0, Math.floor((bytes.length - start) / size));
  }

  const divisor = (channel.scale || 1) * 10 ** channel.dec;
  const m = channel.mul;
  const s = channel.shift;

  const decoded = new Array(n);
  let sawNonZero = false;
  for (let i = 0; i < n; i++) {
    const off = start + i * size;
    const raw =
      size === 1 ? dv.getInt8(off)
      : size === 2 ? dv.getInt16(off, true)
      : dv.getInt32(off, true);
    const v = (raw * m) / divisor + s;
    decoded[i] = v;
    if (v !== 0) sawNonZero = true;
  }

  channel.samples = decoded;
  channel.allZero = decoded.length > 0 && !sawNonZero;
  return decoded;
}

/** Decode every channel's samples. Convenience for full ingestion. */
export function decodeAll(data, ld) {
  for (const ch of Object.values(ld.channels)) decodeSamples(data, ch);
  return ld;
}

/**
 * Derive lap start times from the Lap Number channel. (The .ldx carries
 * only a summary — per-lap segmentation must come from the .ld itself.)
 * Returns [{lap, startS}] — requires decodeSamples() on "Lap Number" first.
 */
export function lapBoundaries(ld) {
  const ch = ld.channels['Lap Number'];
  if (!ch || !ch.samples.length) return [];

  const rate = ch.sampleRateHz || 1;
  const boundaries = [];
  let prev = null;
  for (let i = 0; i < ch.samples.length; i++) {
    const lap = Math.trunc(ch.samples[i]);
    if (lap !== prev) {
      boundaries.push({ lap, startS: i / rate });
      prev = lap;
    }
  }
  return boundaries;
}
