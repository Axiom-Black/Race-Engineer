#!/usr/bin/env python3
"""Generate the committed golden-master JSON from the sanitized fixture.

WHY THIS SCRIPT EXISTS.

The golden masters are the arbiter for Ring 1 (G1.2, parser truth) and Ring 4
(G4.1, JS parity). Until 21 Aug 2026 they had **no committed generator** — they
arrived with the S1 reference bundle, so regenerating them was an undocumented,
unrepeatable act. Ring 0's G4.3 asserts they were generated from exactly the
committed fixture bytes; this script is what makes that claim reproducible.

The Python parsers are the verified reference implementation. The JS port is
checked against *their* output — never the reverse, which would be the port
validating itself.

THE FORMAT, AND WHY IT IS HASHED.

The original masters embedded every decoded sample, which was affordable only
because the old fixture's channel records had been overwritten to report 300
samples each. The real multi-lap fixture carries **412,850 decoded values**
across 70 channels at nine different logging rates; full arrays would be ~6 MB
of JSON committed to the repo and re-read on every CI run.

Each channel therefore records a **SHA-256 over its complete decoded array**,
plus decode parameters, count, extremes and head/tail samples. This is strictly
stronger than decimating: the hash covers all 412,850 values, whereas keeping
every Nth sample cannot see a regression between the samples it kept. The
extremes and edge values stay in plain text so a failure is diagnosable by eye
instead of only as "hash mismatch".

CROSS-LANGUAGE HASH STABILITY IS THE WHOLE GAME.

The hash is worthless unless Python and JavaScript compute it identically, so
the canonical form is defined narrowly:

  * each value fixed to exactly 6 decimal places
  * negative zero normalised to zero — Python renders -0.0 as "-0.000000"
    while JS's (-0).toFixed(6) yields "0.000000", so it must be forced
  * joined with a single comma, no spaces, no trailing separator
  * hashed as UTF-8

Six decimals sits well inside the precision of the decode formula
(phys = raw * mul / (scale * 10^dec) + shift, from integer inputs), so the
rounding cannot mask a real decode error while it does absorb
float-representation noise between runtimes.

Usage:
    python backend/scripts/generate_golden_masters.py           # write
    python backend/scripts/generate_golden_masters.py --check   # verify only
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "backend"))

from app.ingest.motec import decode_all, lap_boundaries, parse_ld  # noqa: E402

FIXTURES = REPO / "fixtures"
STEM = "cota_gte_sanitized"
EDGE = 5
DECIMALS = 6


def canonical(values):
    """The exact string both runtimes must agree on. See the module docstring."""
    parts = []
    for v in values:
        # Normalise -0.0 -> 0.0: the runtimes disagree on its rendering, and the
        # sign of zero is never meaningful in a decoded telemetry value.
        if v == 0:
            v = 0.0
        parts.append(f"{v:.{DECIMALS}f}")
    return ",".join(parts)


def digest(values):
    return hashlib.sha256(canonical(values).encode("utf-8")).hexdigest()


def build(ld_bytes):
    ld = parse_ld(ld_bytes)
    decode_all(ld_bytes, ld)

    channels = {}
    for name, ch in sorted(ld.channels.items()):
        s = ch.samples
        channels[name] = {
            # Decode parameters: a change to any one alters every value.
            "bytes_per_sample": ch.bytes_per_sample,
            "shift": ch.shift,
            "mul": ch.mul,
            "scale": ch.scale,
            "dec": ch.dec,
            "unit": ch.unit,
            "sample_rate_hz": ch.sample_rate_hz,
            "count": len(s),
            "all_zero": ch.all_zero,
            "reliable": ch.reliable,
            "sha256": digest(s),
            "min": round(min(s), DECIMALS) if s else None,
            "max": round(max(s), DECIMALS) if s else None,
            "first": [round(v, DECIMALS) for v in s[:EDGE]],
            "last": [round(v, DECIMALS) for v in s[-EDGE:]],
        }

    total = sum(c["count"] for c in channels.values())
    return {
        "_meta": {
            "fixture": STEM,
            "formula": "phys = raw * mul / (scale * 10^dec) + shift",
            "driver_name_offset": "0x9E (confirmed by byte inspection)",
            "purpose": (
                "Ring 1 G1.2 parser truth and Ring 4 G4.1 JS parity. "
                "The JS port must reproduce these hashes exactly."
            ),
            "format": (
                "v2, 21 Aug 2026 - per-channel SHA-256 over the complete decoded "
                f"array replaces embedded full arrays. Canonical form: {DECIMALS} "
                "decimals fixed, negative zero normalised, joined by ',', hashed "
                "as UTF-8. The hash covers every sample; decimating would not."
            ),
            "generator": "backend/scripts/generate_golden_masters.py",
            "total_decoded_values": total,
        },
        "header": {
            "date": ld.header.date,
            "time": ld.header.time,
            "driver": ld.header.driver,
            "venue": ld.header.venue,
        },
        "channel_count": len(channels),
        "channels": channels,
        "lap_boundaries": [
            {"lap": lap, "start_s": round(start, 3)} for lap, start in lap_boundaries(ld)
        ],
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="verify only; write nothing")
    args = ap.parse_args()

    ld_path = FIXTURES / f"{STEM}.ld"
    if not ld_path.exists():
        print(f"error: {ld_path} not found", file=sys.stderr)
        return 2

    built = build(ld_path.read_bytes())
    out = FIXTURES / "golden_master_ld.json"

    if args.check:
        if not out.exists():
            print(f"error: {out} missing", file=sys.stderr)
            return 1
        have = json.loads(out.read_text())
        # Compare only the assertive parts; _meta is prose and may be edited.
        for key in ("header", "channel_count", "channels", "lap_boundaries"):
            if have.get(key) != built[key]:
                print(f"MISMATCH in '{key}' - regenerate the golden master", file=sys.stderr)
                if key == "channels":
                    for name, exp in built["channels"].items():
                        got = (have.get("channels") or {}).get(name)
                        if got != exp:
                            print(
                                f"  {name}: committed sha256={(got or {}).get('sha256')} "
                                f"actual={exp['sha256']}",
                                file=sys.stderr,
                            )
                return 1
        print(f"OK - golden master matches {ld_path.name}")
        return 0

    out.write_text(json.dumps(built, indent=1, sort_keys=True) + "\n")
    print(f"wrote {out.relative_to(REPO)}")
    print(
        f"  {built['channel_count']} channels, "
        f"{built['_meta']['total_decoded_values']:,} decoded values, "
        f"{len(built['lap_boundaries'])} lap boundaries"
    )
    print(f"  size: {out.stat().st_size / 1024:.1f} KB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
