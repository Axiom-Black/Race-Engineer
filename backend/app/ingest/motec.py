"""
MoTeC .ld binary telemetry parser — LMU exports.

Every offset in this file was confirmed by direct byte inspection of a real
LMU export (COTA, Ferrari 488 GTE, 2026-06-30), not taken from a generic
spec. See motec-ld-format.md for the full derivation.

DECODE FORMULA (confirmed against known physical ranges):

    phys = raw * mul / 10^dec + shift

Where mul, dec, shift are per-channel header fields. Validation evidence:
  - Throttle Pos:  raw ±25000 -> exactly 0.00..100.00 %
  - Ground Speed:  0..245.98 km/h (GTE at COTA, physically correct)
  - Fuel Level:    79.92..93.00 L (cross-checks the .svm FuelSetting 93L)
  - G Force Lat:   -2.38..+2.10 G (correct cornering loads)
  - Engine RPM:    0..7996 (matches the 7500 rev-limit setup)

FILE LAYOUT:
  Header:
    0x08  u32  channel-metadata pointer
    0x0C  u32  channel-data pointer
    0x5E  str  date  ("30/06/2026")
    0x7E  str  time  ("19:32:27")
    0x9E  str  driver name
    0x15E str  venue

  Channel metadata records — 124 bytes, singly linked via next-pointer:
    0x04  u32  next record pointer (0 = end of list)
    0x08  u32  absolute pointer to this channel's sample data
    0x0C  u32  sample count
    0x14  u16  bytes per sample (1, 2, or 4)
    0x16  u16  sample rate (Hz)
    0x18  s16  shift  — additive offset in PHYSICAL units
    0x1A  s16  mul    — multiplier
    0x1C  s16  scale  — divides alongside 10^dec; 1 for 67/70 channels but
                        50 for the temperature channels and 9 for steering wheel
    0x1E  s16  dec    — decimal shift (divide by 10^dec)
    0x20  s32  channel name  (32 bytes, NUL-padded)
    0x40  s8   short name    (8 bytes)
    0x48  s12  unit          (12 bytes)

KNOWN LMU QUIRKS (simulator-side, not parser bugs):
  - Tyre Load, Grip Fract, Battery Charge: exported but all-zero for GTE cars.
  - Ambient / Track Temperature: were previously flagged "unreliable" — that was
    OUR bug (dropped scale=50), not LMU's. With scale they read correctly
    (ambient ~29 C, track ~39 C). No longer flagged.
  - Steering Wheel Position: all-zero for this session (redundant with the
    working "Steering" channel). Flagged all_zero, not unreliable.

Clean Code: pure functions over bytes; no file I/O in parse logic.
Clean Architecture: MoTeC's binary format never leaks past this module.
"""

from __future__ import annotations

import struct
from dataclasses import dataclass, field

# Channels LMU exports but does not populate (or populates with garbage).
# We parse them anyway but mark reliable=False so downstream consumers
# (agents, UI) can filter without this module hiding data.
UNRELIABLE_CHANNELS: set[str] = {
    # Empty as of the scale fix: the temperature channels that used to live
    # here decode correctly once scale is applied. Kept as a hook for any
    # genuinely simulator-corrupted channel discovered in future exports.
}
_UNUSED_LEGACY_UNRELIABLE = {
    "Ambient Temperature",
    "Track Temperature",
}
KNOWN_EMPTY_FOR_SOME_CARS = {
    "Tyre Load FL", "Tyre Load FR", "Tyre Load RL", "Tyre Load RR",
    "Grip Fract FL", "Grip Fract FR", "Grip Fract RL", "Grip Fract RR",
    "Battery Charge Level",
}

# Header field offsets (confirmed by inspection)
_META_PTR_OFFSET = 0x08
_DATE_OFFSET = 0x5E
_TIME_OFFSET = 0x7E
_DRIVER_OFFSET = 0x9E
_VENUE_OFFSET = 0x15E

# Channel record field offsets
_REC_SIZE = 124
_NEXT_PTR = 0x04
_DATA_PTR = 0x08
_SAMPLE_COUNT = 0x0C
_DTYPE_SIZE = 0x14
_SAMPLE_RATE = 0x16
_SHIFT = 0x18
_MUL = 0x1A
_SCALE = 0x1C
_DEC = 0x1E
_NAME = 0x20
_NAME_LEN = 32
_UNIT = 0x48
_UNIT_LEN = 12


@dataclass(frozen=True)
class LdHeader:
    date: str
    time: str
    driver: str
    venue: str


@dataclass
class LdChannel:
    name: str
    unit: str
    sample_rate_hz: int
    sample_count: int
    bytes_per_sample: int
    # decode parameters
    shift: int
    mul: int
    scale: int
    dec: int
    # location in file
    data_offset: int
    # quality flags
    reliable: bool = True
    all_zero: bool = False
    # decoded samples — populated by decode_samples(), not at parse time,
    # so callers can parse the channel table cheaply without decoding 850KB.
    samples: list[float] = field(default_factory=list)


@dataclass
class LdFile:
    header: LdHeader
    channels: dict[str, LdChannel]


def _read_str(data: bytes, offset: int, max_len: int) -> str:
    chunk = data[offset : offset + max_len]
    nul = chunk.find(b"\x00")
    if nul >= 0:
        chunk = chunk[:nul]
    return chunk.decode("latin1", errors="replace").strip()


def parse_ld(data: bytes) -> LdFile:
    """
    Parse a .ld file's header and channel table.
    Does NOT decode sample data — call decode_samples() per channel for that,
    so a caller who only wants the channel inventory pays nothing for samples.

    Raises:
        ValueError: if the file is too small or the metadata pointer is invalid.
    """
    if len(data) < 0x200:
        raise ValueError(f".ld file too small ({len(data)} bytes)")

    meta_ptr = struct.unpack_from("<I", data, _META_PTR_OFFSET)[0]
    if not (0 < meta_ptr < len(data)):
        raise ValueError(f"Invalid channel metadata pointer 0x{meta_ptr:x}")

    header = LdHeader(
        date=_read_str(data, _DATE_OFFSET, 16),
        time=_read_str(data, _TIME_OFFSET, 16),
        driver=_read_str(data, _DRIVER_OFFSET, 32),
        venue=_read_str(data, _VENUE_OFFSET, 64),
    )

    channels: dict[str, LdChannel] = {}
    ptr = meta_ptr
    seen: set[int] = set()

    while ptr and 0 < ptr < len(data) and ptr not in seen:
        seen.add(ptr)
        if ptr + _REC_SIZE > len(data):
            break
        rec = data[ptr : ptr + _REC_SIZE]

        next_ptr = struct.unpack_from("<I", rec, _NEXT_PTR)[0]
        data_ptr = struct.unpack_from("<I", rec, _DATA_PTR)[0]
        n_samples = struct.unpack_from("<I", rec, _SAMPLE_COUNT)[0]
        dsize = struct.unpack_from("<H", rec, _DTYPE_SIZE)[0]
        rate = struct.unpack_from("<H", rec, _SAMPLE_RATE)[0]
        shift = struct.unpack_from("<h", rec, _SHIFT)[0]
        mul = struct.unpack_from("<h", rec, _MUL)[0]
        scale = struct.unpack_from("<h", rec, _SCALE)[0]
        dec = struct.unpack_from("<h", rec, _DEC)[0]
        name = _read_str(rec, _NAME, _NAME_LEN)
        unit = _read_str(rec, _UNIT, _UNIT_LEN)

        if name:
            channels[name] = LdChannel(
                name=name,
                unit=unit,
                sample_rate_hz=rate,
                sample_count=n_samples,
                bytes_per_sample=dsize if dsize in (1, 2, 4) else 2,
                shift=shift,
                mul=mul if mul != 0 else 1,
                scale=scale if scale != 0 else 1,
                dec=dec,
                data_offset=data_ptr,
                reliable=name not in UNRELIABLE_CHANNELS,
            )

        if next_ptr == 0 or next_ptr == ptr:
            break
        ptr = next_ptr

    return LdFile(header=header, channels=channels)


def decode_samples(data: bytes, channel: LdChannel) -> list[float]:
    """
    Decode a channel's raw samples to physical values using the confirmed
    formula:  phys = raw * mul / (scale * 10^dec) + shift

    `scale` is 1 for 67 of 70 LMU channels, so it was invisible until the
    three channels that DO use it were checked: Ambient Temperature (scale=50),
    Track Temperature (scale=50), Steering Wheel Position (scale=9). Dropping
    scale is what previously made the two temperature channels read as garbage
    (-265 C / +251 C); with scale they read a correct 29-30 C ambient and
    ~39 C track. See G1.5 evidence in TESTING_GATES / findings doc.

    Populates channel.samples and channel.all_zero as a side effect,
    and returns the decoded list.
    """
    n = channel.sample_count
    size = channel.bytes_per_sample
    start = channel.data_offset
    end = start + n * size

    if end > len(data):
        # Truncated file — decode what exists rather than raising,
        # but never read past the buffer.
        n = max(0, (len(data) - start) // size)
        end = start + n * size

    fmt = {1: "b", 2: "h", 4: "i"}[size]
    raw = struct.unpack_from(f"<{n}{fmt}", data, start) if n else ()

    divisor = (channel.scale or 1) * 10 ** channel.dec
    m = channel.mul
    s = channel.shift
    decoded = [r * m / divisor + s for r in raw]

    channel.samples = decoded
    channel.all_zero = bool(decoded) and all(v == 0 for v in decoded)
    return decoded


def decode_all(data: bytes, ld: LdFile) -> LdFile:
    """Decode every channel's samples. Convenience for full ingestion."""
    for ch in ld.channels.values():
        decode_samples(data, ch)
    return ld


# ── Lap segmentation ──────────────────────────────────────────────

def lap_boundaries(ld: LdFile) -> list[tuple[int, float]]:
    """
    Derive lap start times from the Lap Number channel.
    (The .ldx carries only a summary — total laps and fastest lap — so
    per-lap segmentation must come from the .ld itself.)

    Returns a list of (lap_number, start_time_seconds) tuples, where
    start_time is relative to the start of the channel's samples.

    Requires decode_samples() to have been called on "Lap Number".
    """
    ch = ld.channels.get("Lap Number")
    if ch is None or not ch.samples:
        return []

    rate = ch.sample_rate_hz or 1
    boundaries: list[tuple[int, float]] = []
    prev = None
    for i, v in enumerate(ch.samples):
        lap = int(v)
        if lap != prev:
            boundaries.append((lap, i / rate))
            prev = lap
    return boundaries
