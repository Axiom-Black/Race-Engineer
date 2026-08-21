"""
Tests for app.ingest.motec.

Two layers:
  1. Unit tests against a hand-built synthetic .ld fixture — always run.
  2. Integration tests against the real LMU COTA export — run only when the
     file is present (skipped otherwise), asserting the exact physical ranges
     we confirmed during the decode investigation.
"""

import struct
from pathlib import Path

import pytest

from app.ingest.motec import (
    LdFile,
    decode_all,
    decode_samples,
    lap_boundaries,
    parse_ld,
)

REAL_FILE = Path("/mnt/user-data/uploads/2026-06-30_-_19-32-27_-_Circuit_of_the_Americas_-_P1.ld")


# ── Synthetic fixture builder ─────────────────────────────────────

def build_fixture() -> bytes:
    """
    Minimal but structurally correct .ld: header + 2 channel records + data.
    Channel A 'Test Throttle': 4 samples, s16, mul=2 dec=3 shift=50
        raw [-25000, 0, 12500, 25000] -> phys [0, 50, 75, 100]
    Channel B 'Test Gear': 3 samples, s8, mul=1 dec=0 shift=0
        raw [0, 3, 5] -> phys [0, 3, 5]
    """
    size = 0x1000
    buf = bytearray(size)

    meta_ptr = 0x400
    rec_b_ptr = meta_ptr + 124
    data_a_ptr = 0x800
    data_b_ptr = 0x900

    struct.pack_into("<I", buf, 0x08, meta_ptr)

    # header strings
    def put(off: int, s: str) -> None:
        buf[off : off + len(s)] = s.encode()

    put(0x5E, "30/06/2026")
    put(0x7E, "19:32:27")
    put(0x9E, "Test Driver")
    put(0x15E, "Test Venue")

    # record A — Test Throttle
    struct.pack_into("<I", buf, meta_ptr + 0x04, rec_b_ptr)   # next
    struct.pack_into("<I", buf, meta_ptr + 0x08, data_a_ptr)  # data ptr
    struct.pack_into("<I", buf, meta_ptr + 0x0C, 4)           # samples
    struct.pack_into("<H", buf, meta_ptr + 0x14, 2)           # 2 bytes
    struct.pack_into("<H", buf, meta_ptr + 0x16, 10)          # 10 Hz
    struct.pack_into("<h", buf, meta_ptr + 0x18, 50)          # shift
    struct.pack_into("<h", buf, meta_ptr + 0x1A, 2)           # mul
    struct.pack_into("<h", buf, meta_ptr + 0x1C, 1)           # scale
    struct.pack_into("<h", buf, meta_ptr + 0x1E, 3)           # dec
    put(meta_ptr + 0x20, "Test Throttle")
    put(meta_ptr + 0x48, "%")

    # record B — Test Gear (last: next = 0)
    struct.pack_into("<I", buf, rec_b_ptr + 0x04, 0)
    struct.pack_into("<I", buf, rec_b_ptr + 0x08, data_b_ptr)
    struct.pack_into("<I", buf, rec_b_ptr + 0x0C, 3)
    struct.pack_into("<H", buf, rec_b_ptr + 0x14, 1)          # 1 byte
    struct.pack_into("<H", buf, rec_b_ptr + 0x16, 10)
    struct.pack_into("<h", buf, rec_b_ptr + 0x18, 0)
    struct.pack_into("<h", buf, rec_b_ptr + 0x1A, 1)
    struct.pack_into("<h", buf, rec_b_ptr + 0x1C, 1)
    struct.pack_into("<h", buf, rec_b_ptr + 0x1E, 0)
    put(rec_b_ptr + 0x20, "Test Gear")

    # channel data
    struct.pack_into("<4h", buf, data_a_ptr, -25000, 0, 12500, 25000)
    struct.pack_into("<3b", buf, data_b_ptr, 0, 3, 5)

    return bytes(buf)


FIXTURE = build_fixture()


# ── Unit tests (synthetic) ────────────────────────────────────────

def _canonical_digest(values: list[float]) -> str:
    """Mirror backend/scripts/generate_golden_masters.py exactly.

    Six fixed decimals, negative zero normalised (Python renders -0.0 as
    "-0.000000" where JS's toFixed gives "0.000000"), joined by ',', UTF-8.
    """
    parts = []
    for v in values:
        if v == 0:
            v = 0.0
        parts.append(f"{v:.6f}")
    return _hashlib.sha256(",".join(parts).encode("utf-8")).hexdigest()


class TestHeader:
    def test_header_fields(self) -> None:
        ld = parse_ld(FIXTURE)
        assert ld.header.date == "30/06/2026"
        assert ld.header.time == "19:32:27"
        assert ld.header.driver == "Test Driver"
        assert ld.header.venue == "Test Venue"

    def test_too_small_raises(self) -> None:
        with pytest.raises(ValueError):
            parse_ld(b"\x00" * 16)

    def test_bad_meta_pointer_raises(self) -> None:
        bad = bytearray(0x400)
        struct.pack_into("<I", bad, 0x08, 0xFFFFFFF0)
        with pytest.raises(ValueError):
            parse_ld(bytes(bad))


class TestChannelTable:
    def test_two_channels_found(self) -> None:
        ld = parse_ld(FIXTURE)
        assert set(ld.channels) == {"Test Throttle", "Test Gear"}

    def test_channel_metadata(self) -> None:
        ch = parse_ld(FIXTURE).channels["Test Throttle"]
        assert ch.unit == "%"
        assert ch.sample_rate_hz == 10
        assert ch.sample_count == 4
        assert ch.bytes_per_sample == 2
        assert (ch.shift, ch.mul, ch.dec) == (50, 2, 3)

    def test_one_byte_channel(self) -> None:
        ch = parse_ld(FIXTURE).channels["Test Gear"]
        assert ch.bytes_per_sample == 1
        assert ch.sample_count == 3


class TestDecodeFormula:
    """phys = raw * mul / 10^dec + shift — the confirmed formula."""

    def test_throttle_decodes_zero_to_hundred(self) -> None:
        ld = parse_ld(FIXTURE)
        vals = decode_samples(FIXTURE, ld.channels["Test Throttle"])
        assert vals == pytest.approx([0.0, 50.0, 75.0, 100.0])

    def test_gear_identity_decode(self) -> None:
        ld = parse_ld(FIXTURE)
        vals = decode_samples(FIXTURE, ld.channels["Test Gear"])
        assert vals == pytest.approx([0.0, 3.0, 5.0])

    def test_samples_stored_on_channel(self) -> None:
        ld = parse_ld(FIXTURE)
        ch = ld.channels["Test Gear"]
        decode_samples(FIXTURE, ch)
        assert ch.samples == pytest.approx([0.0, 3.0, 5.0])

    def test_decode_all_populates_everything(self) -> None:
        ld = decode_all(FIXTURE, parse_ld(FIXTURE))
        assert all(ch.samples for ch in ld.channels.values())

    def test_truncated_data_does_not_overread(self) -> None:
        # cut the buffer just past channel A's second sample
        ld = parse_ld(FIXTURE)
        ch = ld.channels["Test Throttle"]
        cut = FIXTURE[: ch.data_offset + 2 * ch.bytes_per_sample]
        vals = decode_samples(cut, ch)
        assert len(vals) == 2
        assert vals == pytest.approx([0.0, 50.0])


# ── Integration tests (real LMU file, skipped when absent) ───────

needs_real = pytest.mark.skipif(not REAL_FILE.exists(), reason="real .ld sample not present")


@needs_real
class TestRealFile:
    @pytest.fixture(scope="class")
    def real(self) -> tuple[bytes, LdFile]:
        data = REAL_FILE.read_bytes()
        return data, parse_ld(data)

    def test_seventy_channels(self, real) -> None:
        _, ld = real
        assert len(ld.channels) == 70

    def test_header(self, real) -> None:
        _, ld = real
        assert ld.header.venue == "Circuit of the Americas"
        assert ld.header.driver  # real name lives only in the local, uncommitted file
        assert ld.header.date == "30/06/2026"

    def test_throttle_full_range(self, real) -> None:
        data, ld = real
        vals = decode_samples(data, ld.channels["Throttle Pos"])
        assert min(vals) == pytest.approx(0.0, abs=0.01)
        assert max(vals) == pytest.approx(100.0, abs=0.01)

    def test_ground_speed_physical(self, real) -> None:
        data, ld = real
        vals = decode_samples(data, ld.channels["Ground Speed"])
        assert min(vals) == pytest.approx(0.0, abs=0.1)
        assert 240 < max(vals) < 250     # GTE at COTA

    def test_fuel_matches_setup(self, real) -> None:
        data, ld = real
        vals = decode_samples(data, ld.channels["Fuel Level"])
        assert max(vals) == pytest.approx(93.0, abs=0.1)   # .svm FuelSetting: 93L
        assert min(vals) > 75                              # burned down, never empty

    def test_g_force_centred(self, real) -> None:
        data, ld = real
        vals = decode_samples(data, ld.channels["G Force Lat"])
        assert -3.0 < min(vals) < -1.0
        assert 1.0 < max(vals) < 3.0

    def test_rpm_respects_rev_limit(self, real) -> None:
        data, ld = real
        vals = decode_samples(data, ld.channels["Engine RPM"])
        assert max(vals) < 8100     # 7500 limit + overrun margin

    def test_brake_temps_carbon_range(self, real) -> None:
        data, ld = real
        vals = decode_samples(data, ld.channels["Brake Temp FL"])
        assert max(vals) > 500      # carbon brakes get very hot
        assert min(vals) >= 20      # never below ambient

    def test_temperature_channels_decode_correctly_with_scale(self, real) -> None:
        # Regression for the scale fix: these were previously flagged unreliable
        # because the parser dropped scale=50. With scale they read correctly.
        data, ld = real
        amb = decode_samples(data, ld.channels["Ambient Temperature"])
        trk = decode_samples(data, ld.channels["Track Temperature"])
        assert 20 < max(amb) < 40      # summer-evening ambient, not -265 C
        assert 30 < max(trk) < 55      # warm track, not +251 C
        assert ld.channels["Ambient Temperature"].scale == 50

    def test_scale_field_captured(self, real) -> None:
        _, ld = real
        # scale is 1 for most channels, non-1 for exactly three
        non_one = {n: c.scale for n, c in ld.channels.items() if c.scale != 1}
        assert non_one == {
            "Steering Wheel Position": 9,
            "Ambient Temperature": 50,
            "Track Temperature": 50,
        }

    def test_gps_channels_are_int32_not_float32(self, real) -> None:
        # G1.5 Q2: the two 4-byte channels are int32 (dcat=5), NOT float32.
        data, ld = real
        lat = decode_samples(data, ld.channels["GPS Latitude"])
        lon = decode_samples(data, ld.channels["GPS Longitude"])
        # int32 interpretation yields small game-world coords; float32 would
        # yield ~1e35 garbage. Assert the sane int32 range.
        assert -1 < min(lat) < 1 and -1 < max(lat) < 1
        assert -140 < min(lon) < -130
        assert ld.channels["GPS Latitude"].bytes_per_sample == 4

    def test_ground_speed_still_correct_after_scale_change(self, real) -> None:
        data, ld = real
        vals = decode_samples(data, ld.channels["Ground Speed"])
        assert min(vals) == pytest.approx(0.0, abs=0.1)
        assert 240 < max(vals) < 250

    def test_lap_boundaries_found(self, real) -> None:
        data, ld = real
        decode_samples(data, ld.channels["Lap Number"])
        bounds = lap_boundaries(ld)
        laps = [b[0] for b in bounds]
        assert laps == sorted(laps)          # monotonically increasing
        assert max(laps) == 4                # matches decoded Lap Number max
        assert bounds[0][1] == pytest.approx(0.0)   # first boundary at t=0


# ── CI fixture tests (run against the COMMITTED sanitized fixture) ──
# These do NOT skip — the fixture ships in the repo, so CI always runs them.
# This is the Ring 0 / Ring 1 path: safe data, always present.

import hashlib as _hashlib
import json as _json
from pathlib import Path as _Path

# Canonical fixture location is repo-root fixtures/ (TESTING_GATES.md G0.1),
# not backend/tests/fixtures/ — see FIXTURE_NOTES.md for the golden-master split.
_FX = _Path(__file__).parent.parent.parent.parent / "fixtures"
_GOLDEN = _FX / "golden_master_ld.json"
_LD = _FX / "cota_gte_sanitized.ld"


class TestSanitizedFixture:
    """Ring 0 G0.1/G0.2 + Ring 1 G1.2 — the committed fixture is the CI truth."""

    def test_fixture_present(self) -> None:
        assert _LD.exists(), "sanitized .ld fixture must be committed"
        assert _GOLDEN.exists(), "golden master must be committed"

    def test_no_driver_pii(self) -> None:
        ld = parse_ld(_LD.read_bytes())
        assert ld.header.driver == "DRIVER_REDACTED", "G0.2: real driver name must not be in the repo"

    def test_all_seventy_channels(self) -> None:
        ld = parse_ld(_LD.read_bytes())
        assert len(ld.channels) == 70

    def test_golden_master_match(self) -> None:
        """G1.2 — decoding the fixture must reproduce the committed snapshot."""
        data = _LD.read_bytes()
        ld = parse_ld(data)
        golden = _json.loads(_GOLDEN.read_text())

        assert ld.header.venue == golden["header"]["venue"]
        assert ld.header.driver == "DRIVER_REDACTED"
        assert len(ld.channels) == golden["channel_count"]

        for name, gch in golden["channels"].items():
            ch = ld.channels[name]
            assert ch.mul == gch["mul"], f"{name} mul drift"
            assert ch.dec == gch["dec"], f"{name} dec drift"
            assert ch.shift == gch["shift"], f"{name} shift drift"
            assert ch.scale == gch["scale"], f"{name} scale drift"
            decoded = decode_samples(data, ch)
            # Golden master v2 (21 Aug 2026) asserts a SHA-256 over the whole
            # decoded array instead of embedding every value: the multi-lap
            # fixture carries 412,850 values across 70 channels, which as full
            # arrays was ~6 MB of committed JSON. The hash covers every sample —
            # decimating would not. Canonical form is defined once, in
            # backend/scripts/generate_golden_masters.py, and must stay
            # byte-identical to the JS side or neither verifies anything.
            assert len(decoded) == gch["count"], f"{name} sample count drift"
            assert _canonical_digest(decoded) == gch["sha256"], (
                f"{name} decoded trace drift vs golden master"
            )
            # Redundant while the hash passes; the only readable signal when it
            # does not.
            assert round(min(decoded), 6) == gch["min"], f"{name} min drift"
            assert round(max(decoded), 6) == gch["max"], f"{name} max drift"

    def test_fixture_is_the_full_multi_lap_session(self) -> None:
        """The fixture must be able to express multi-lap logic at all.

        Its predecessor had every channel record overwritten to report 300
        samples, so lap segmentation saw a single partial lap. That hid two real
        bugs (out-lap classification, .ldx/.ld lap reconciliation) and shipped a
        demo session advertising a fastest lap that did not exist.
        """
        data = _LD.read_bytes()
        ld = parse_ld(data)
        decode_all(data, ld)
        bounds = lap_boundaries(ld)
        # out-lap + 3 timed + trailing partial
        assert len(bounds) == 5, f"expected 5 segments, got {len(bounds)}"
        total = sum(len(c.samples) for c in ld.channels.values())
        assert total > 400_000, f"fixture looks truncated: {total} decoded values"

    def test_scale_term_channels(self) -> None:
        """G1.5-Q1 — the three scale!=1 channels decode with the scale divisor."""
        data = _LD.read_bytes()
        ld = parse_ld(data)
        amb = decode_samples(data, ld.channels["Ambient Temperature"])
        assert 20 < max(amb) < 45, "Ambient Temp must use scale=50 (else reads ~-265C)"
        assert ld.channels["Ambient Temperature"].scale == 50
        assert ld.channels["Track Temperature"].scale == 50
        assert ld.channels["Steering Wheel Position"].scale == 9

    def test_no_float32_channels(self) -> None:
        """G1.5-Q2 — GPS channels are int32, not float32; no channel is float."""
        ld = parse_ld(_LD.read_bytes())
        # the only 4-byte channels are the two GPS channels
        four_byte = [c for c in ld.channels.values() if c.bytes_per_sample == 4]
        names = {c.name for c in four_byte}
        assert names == {"GPS Latitude", "GPS Longitude"}
        # decoded as int32 they must be physical game-world coords
        data = _LD.read_bytes()
        lon = decode_samples(data, ld.channels["GPS Longitude"])
        assert -136 < min(lon) < -134, "GPS lon must decode as int32 (game-world), not float32"
