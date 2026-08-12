// LMU/rF2 .svm setup file parser.
// Grounded in the real-file format (see CLAUDE.md and the golden master):
// INI-style [SECTION] headers with `Key=N//human value` lines (CRLF), where
// the integer is a click-index and the REAL value lives in the //comment.
// The golden master (fixtures/golden_master_svm.json) is the contract:
// sections -> { SECTION: { Key: { idx, value } } } plus the special
// `_vehicle_class` entry carrying the raw VehicleClassSetting string.

const SECTION_RE = /^\[([A-Za-z0-9_]+)\]\s*$/;
const ENTRY_RE = /^([A-Za-z0-9_]+)=(-?\d+)\/\/(.*)$/;
const VEHICLE_CLASS_RE = /^VehicleClassSetting="([^"]*)"\s*$/;

/**
 * Parse the contents of a .svm file.
 * Returns { sections, sectionCount } where sections maps each [SECTION]
 * to { Key: { idx, value } } and `_vehicle_class` to the raw string.
 * sectionCount counts real [SECTION] headers only.
 */
export function parseSvm(rawText) {
  const sections = {};
  let sectionCount = 0;
  let current = null;

  for (const rawLine of String(rawText).split('\n')) {
    const line = rawLine.replace(/\r$/, '');

    const vc = VEHICLE_CLASS_RE.exec(line);
    if (vc) {
      sections['_vehicle_class'] = vc[1];
      continue;
    }

    const sec = SECTION_RE.exec(line);
    if (sec) {
      current = sec[1];
      if (!(current in sections)) {
        sections[current] = {};
        sectionCount += 1;
      }
      continue;
    }

    if (current === null) continue; // preamble comments / UpgradeSetting etc.

    const entry = ENTRY_RE.exec(line);
    if (entry) {
      const [, key, idx, comment] = entry;
      // comment is trimmed of surrounding whitespace (matches the golden
      // generator); interior spacing is preserved — '68 kgf  (85%)'.
      sections[current][key] = { idx: parseInt(idx, 10), value: comment.trim() };
    }
  }

  return { sections, sectionCount };
}

/**
 * Split the VehicleClassSetting string into its parts, e.g.
 * "Ferrari_488_GTE_EVO GTE WEC2023" -> { car, carClass, ruleset }.
 */
export function vehicleInfo(parsed) {
  const raw = parsed.sections['_vehicle_class'];
  if (!raw) return { car: null, carClass: null, ruleset: null };
  const parts = raw.split(/\s+/);
  return {
    car: parts[0] ?? null,
    carClass: parts[1] ?? null,
    ruleset: parts[2] ?? null,
  };
}

/**
 * Energy-model branch (real data-model branch, not a footnote):
 * Hypercar/LMGT3 carry VirtualEnergySetting; GTE/LMP2/LMP3 carry fuel.
 */
export function energyScheme(parsed) {
  const general = parsed.sections['GENERAL'] ?? {};
  return 'VirtualEnergySetting' in general ? 'virtual_energy' : 'fuel';
}
