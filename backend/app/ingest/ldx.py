"""
MoTeC .ldx parser — the XML companion to a .ld telemetry file.

Confirmed structure (LMU export, LDXFile Version 1.6):

    <LDXFile Version="1.6">
     <Layers>
      <Details>
       <String  Id="Total Laps"   Value="3"/>
       <String  Id="Fastest Time" Value="2:15.475"/>
       <String  Id="Fastest Lap"  Value="2"/>
       <Numeric Id="_Setup_DiffPower"   Value="40"  Unit="%"    DPS="3"/>
       <Numeric Id="_Setup_FLRideHeight" Value="5.0" Unit="cm"  DPS="3"/>
       ... (139 _Setup_* entries)
      </Details>
     </Layers>
    </LDXFile>

Two things this file gives us:
  1. Session summary — total laps, fastest lap index, fastest time.
  2. A setup snapshot ALREADY decoded to engineering units (unlike the .svm,
     where values are click-indices and the real value is buried in a //comment).
     For populating the agent's setup context, this is the preferred source.

What this file does NOT contain (confirmed by inspection):
  - Per-lap boundary timestamps / beacon offsets. Lap segmentation must come
    from the .ld's own Beacon and Lap Number channels, not from here.

Clean Code: pure parsing, caller supplies the XML text. No disk I/O here.
Clean Agile (TDD): designed to be tested against fixture strings.

NOTE: MoTeC's .ldx export has a known truncation bug — values containing a
'(' get cut (e.g. BrakePressure "68 kgf (85%)" becomes "68 kgf  (85"). Where a
field matters and looks truncated, prefer the .svm comment for that one field.
"""

from __future__ import annotations

import xml.etree.ElementTree as ET
from dataclasses import dataclass, field


@dataclass(frozen=True)
class SetupValue:
    """One decoded setup parameter from the .ldx _Setup_ block."""
    key: str                 # e.g. "DiffPower" (the _Setup_ prefix stripped)
    value: str               # raw string value as exported, e.g. "40", "Soft", "N/A"
    unit: str                # e.g. "%", "cm", "N/mm", "" if none
    numeric: float | None    # value parsed to float when possible, else None
    truncated: bool          # True if value looks cut by MoTeC's '(' bug


@dataclass
class LdxData:
    """Everything the .ldx yields."""
    total_laps: int | None = None
    fastest_lap: int | None = None
    fastest_time_s: float | None = None
    fastest_time_raw: str | None = None
    setup: dict[str, SetupValue] = field(default_factory=dict)


def _time_to_seconds(text: str) -> float | None:
    """Convert a MoTeC time string like '2:15.475' or '15.475' to seconds."""
    if not text:
        return None
    try:
        if ":" in text:
            mins, rest = text.split(":", 1)
            return int(mins) * 60 + float(rest)
        return float(text)
    except (ValueError, TypeError):
        return None


def _to_float(text: str) -> float | None:
    try:
        return float(text)
    except (ValueError, TypeError):
        return None


def parse_ldx(raw_xml: str) -> LdxData:
    """
    Parse the contents of a .ldx file.

    Args:
        raw_xml: full XML text of the .ldx file.

    Returns:
        LdxData with session summary and the decoded setup block.

    Raises:
        ValueError: if the XML is malformed or has no <Details> element.
    """
    try:
        root = ET.fromstring(raw_xml)
    except ET.ParseError as exc:
        raise ValueError(f"Malformed .ldx XML: {exc}") from exc

    details = root.find(".//Details")
    if details is None:
        raise ValueError(".ldx has no <Details> element")

    data = LdxData()

    # ── Session summary (String elements) ─────────────────────────
    for s in details.findall("String"):
        sid = s.get("Id", "")
        val = s.get("Value", "")
        if sid == "Total Laps":
            data.total_laps = int(val) if val.isdigit() else None
        elif sid == "Fastest Lap":
            data.fastest_lap = int(val) if val.isdigit() else None
        elif sid == "Fastest Time":
            data.fastest_time_raw = val
            data.fastest_time_s = _time_to_seconds(val)

    # ── Setup block (Numeric elements, _Setup_ prefix) ────────────
    for n in details.findall("Numeric"):
        nid = n.get("Id", "")
        if not nid.startswith("_Setup_"):
            continue
        key = nid[len("_Setup_"):]
        value = n.get("Value", "")
        unit = n.get("Unit", "")
        # MoTeC truncation bug: a '(' with no matching ')' signals a cut value.
        truncated = "(" in value and ")" not in value
        data.setup[key] = SetupValue(
            key=key,
            value=value,
            unit=unit,
            numeric=_to_float(value),
            truncated=truncated,
        )

    return data


# ── Convenience accessors for the agent context builder ───────────

def setup_summary(ldx: LdxData) -> dict[str, str]:
    """
    Flatten the setup into a compact {key: "value unit"} dict suitable for
    the cached setup context block in an agent run. Skips N/A and detached
    entries to keep the token count down (output-token discipline).
    """
    out: dict[str, str] = {}
    for key, sv in ldx.setup.items():
        v = sv.value.strip()
        if not v or v in {"N/A", "0", "Detached", "Non-adjustable"}:
            continue
        out[key] = f"{v} {sv.unit}".strip()
    return out
