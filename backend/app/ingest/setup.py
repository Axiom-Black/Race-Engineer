"""
LMU/rF2 .svm setup file parser.

Setup files are plain-text key-value pairs (rF2/LMU shared engine), stored under
UserData/player/Settings/<track>/<car>_<intent>.svm — organised by ByteCraft's
ingest watcher into a per-session upload alongside the MoTeC .ld/.ldx pair.

Clean Code: pure functions, no I/O in the parsing logic itself (the caller
supplies file contents as a string; reading from disk/upload is the route's job).
Clean Agile (TDD): parser is designed to be tested against fixture strings
without needing real files on disk.

Format reference: each line is typically
    Key="Value"
or a nested block:
    Key=
    {
        SubKey="Value"
    }
Comments start with //. Blank lines are common. Exact key names vary by car
and LMU version — KEY_ALIASES below maps the variants we've seen onto one
canonical field name. This list grows as more cars are sampled; an unknown
key is preserved in raw_parsed rather than silently dropped.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

# ── Energy model — LMU class-dependent branch ─────────────────────
# Hypercar and LMGT3 run Virtual Energy; LMP2/LMP3/GTE use raw fuel capacity.
# This is a real data-model branch, not a footnote — see project notes.
VIRTUAL_ENERGY_CATEGORIES = {"Hypercar", "LMGT3"}


@dataclass(frozen=True)
class ParsedSetup:
    """
    Normalised setup values. All fields optional because not every car
    exposes every parameter (e.g. no anti-roll bar on some classes) and
    because a setup file we've never seen the exact key names for should
    still parse — just with fewer fields populated, not an exception.
    """
    front_wing_angle: float | None = None
    rear_wing_angle: float | None = None
    ride_height_front: float | None = None
    ride_height_rear: float | None = None
    spring_front: float | None = None
    spring_rear: float | None = None
    arb_front: float | None = None
    arb_rear: float | None = None
    damper_bump_front: float | None = None
    damper_bump_rear: float | None = None
    damper_rebound_front: float | None = None
    damper_rebound_rear: float | None = None
    brake_bias_pct: float | None = None
    brake_pressure_pct: float | None = None
    diff_power_pct: float | None = None
    diff_coast_pct: float | None = None
    tire_pressure_fl: float | None = None
    tire_pressure_fr: float | None = None
    tire_pressure_rl: float | None = None
    tire_pressure_rr: float | None = None
    energy_type: str = "fuel"          # "fuel" | "virtual_energy"
    fuel_load_kg: float | None = None
    virtual_energy_pct: float | None = None
    gear_ratios: list[float] = field(default_factory=list)
    raw_parsed: dict[str, str] = field(default_factory=dict)   # everything, unmapped


# ── Canonical key aliases ──────────────────────────────────────────
# Maps the various key spellings seen across cars/LMU versions onto one
# canonical ParsedSetup field name. Extend this as new cars are sampled —
# do NOT special-case car names in the parsing logic itself (Open/Closed).
KEY_ALIASES: dict[str, str] = {
    "FWing": "front_wing_angle",
    "FrontWing": "front_wing_angle",
    "RWing": "rear_wing_angle",
    "RearWing": "rear_wing_angle",
    "RideHeightFront": "ride_height_front",
    "RHFront": "ride_height_front",
    "RideHeightRear": "ride_height_rear",
    "RHRear": "ride_height_rear",
    "SpringFront": "spring_front",
    "SpringRear": "spring_rear",
    "ARBFront": "arb_front",
    "AntiRollFront": "arb_front",
    "ARBRear": "arb_rear",
    "AntiRollRear": "arb_rear",
    "BumpFront": "damper_bump_front",
    "BumpRear": "damper_bump_rear",
    "ReboundFront": "damper_rebound_front",
    "ReboundRear": "damper_rebound_rear",
    "BrakeBias": "brake_bias_pct",
    "BrakePressure": "brake_pressure_pct",
    "DiffPower": "diff_power_pct",
    "DiffCoast": "diff_coast_pct",
    "TirePressureFL": "tire_pressure_fl",
    "TirePressureFR": "tire_pressure_fr",
    "TirePressureRL": "tire_pressure_rl",
    "TirePressureRR": "tire_pressure_rr",
    "FuelLoad": "fuel_load_kg",
    "Fuel": "fuel_load_kg",
    "VirtualEnergy": "virtual_energy_pct",
    "VirtEnergy": "virtual_energy_pct",
}

_LINE_RE = re.compile(r'^\s*([A-Za-z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$')
_GEAR_RE = re.compile(r'^\s*Gear(\d+)\s*=\s*"?([\d.]+)"?\s*$')


def _strip_comments(text: str) -> str:
    """Remove // line comments. Pure text transform, no I/O."""
    return "\n".join(line.split("//", 1)[0] for line in text.splitlines())


def _try_float(value: str) -> float | None:
    try:
        return float(value.strip())
    except ValueError:
        return None


def parse_setup(raw_text: str, car_category: str | None = None) -> ParsedSetup:
    """
    Parse the contents of a .svm file into a ParsedSetup.

    Args:
        raw_text: full contents of the .svm file as a string.
        car_category: LMU class ("Hypercar", "LMGT3", "LMP2", "LMP3", "GTE"),
                      used only to decide which energy field is authoritative.
                      If omitted, both fuel_load_kg and virtual_energy_pct are
                      populated from whatever the file contains and energy_type
                      defaults to "fuel".

    Returns:
        ParsedSetup with every recognised field populated; unrecognised
        keys land in raw_parsed so nothing is silently discarded.
    """
    cleaned = _strip_comments(raw_text)
    fields: dict[str, float] = {}
    raw: dict[str, str] = {}
    gears: dict[int, float] = {}

    for line in cleaned.splitlines():
        if not line.strip():
            continue

        gear_match = _GEAR_RE.match(line)
        if gear_match:
            idx, val = gear_match.groups()
            parsed = _try_float(val)
            if parsed is not None:
                gears[int(idx)] = parsed
            continue

        match = _LINE_RE.match(line)
        if not match:
            continue
        key, value = match.groups()
        raw[key] = value

        canonical = KEY_ALIASES.get(key)
        if canonical is None:
            continue
        parsed_val = _try_float(value)
        if parsed_val is not None:
            fields[canonical] = parsed_val

    energy_type = (
        "virtual_energy" if car_category in VIRTUAL_ENERGY_CATEGORIES else "fuel"
    )

    return ParsedSetup(
        front_wing_angle=fields.get("front_wing_angle"),
        rear_wing_angle=fields.get("rear_wing_angle"),
        ride_height_front=fields.get("ride_height_front"),
        ride_height_rear=fields.get("ride_height_rear"),
        spring_front=fields.get("spring_front"),
        spring_rear=fields.get("spring_rear"),
        arb_front=fields.get("arb_front"),
        arb_rear=fields.get("arb_rear"),
        damper_bump_front=fields.get("damper_bump_front"),
        damper_bump_rear=fields.get("damper_bump_rear"),
        damper_rebound_front=fields.get("damper_rebound_front"),
        damper_rebound_rear=fields.get("damper_rebound_rear"),
        brake_bias_pct=fields.get("brake_bias_pct"),
        brake_pressure_pct=fields.get("brake_pressure_pct"),
        diff_power_pct=fields.get("diff_power_pct"),
        diff_coast_pct=fields.get("diff_coast_pct"),
        tire_pressure_fl=fields.get("tire_pressure_fl"),
        tire_pressure_fr=fields.get("tire_pressure_fr"),
        tire_pressure_rl=fields.get("tire_pressure_rl"),
        tire_pressure_rr=fields.get("tire_pressure_rr"),
        energy_type=energy_type,
        fuel_load_kg=fields.get("fuel_load_kg"),
        virtual_energy_pct=fields.get("virtual_energy_pct"),
        gear_ratios=[gears[i] for i in sorted(gears)],
        raw_parsed=raw,
    )


def parse_filename_metadata(filename: str) -> dict[str, str | None]:
    """
    Extract free metadata from the upload path/filename convention:
    UserData/player/Settings/<track>/<car>_<intent>.svm

    Returns car and intent if recognisable; track should come from the
    directory name at the call site, not duplicated here, since this
    function only sees the leaf filename.
    """
    stem = filename.rsplit("/", 1)[-1].rsplit(".", 1)[0]
    intent_keywords = {"qualifying", "race", "practice", "wet", "dry", "test"}
    parts = stem.split("_")

    intent = next((p for p in parts if p.lower() in intent_keywords), None)
    car = "_".join(p for p in parts if p != intent) if intent else stem

    return {"car": car or None, "intent": intent}
