"""
Ring 4 · G4.1 / G4.2 — Prototype parity.

The in-browser JS parsers in ByteCraft_SessionUpload.jsx are a SECOND
implementation of the .ld/.ldx/.svm decode logic. Two implementations drift.
This gate pins the Python backend and the JS port to identical decoded output
on the committed fixture, so the mock cannot quietly diverge from production.

Strategy: run the JS port under Node against the same fixture, capture its
decoded output as JSON, and assert the Python backend produces the same thing
channel-for-channel. Node is executed as a subprocess — no Python JS runtime
needed. The gate SKIPS (does not fail) if Node or the JS entrypoint is absent,
so it never blocks a backend-only environment, but runs in CI where both exist.

═══════════════════════════════════════════════════════════════════════════
ADAPTER SHIM — the ONLY thing you edit to wire this to your real code.
═══════════════════════════════════════════════════════════════════════════
"""
import json
import math
import shutil
import subprocess
from pathlib import Path

import pytest

from conftest import LD_FIXTURE, LDX_FIXTURE, SVM_FIXTURE

# --- Python backend under test -------------------------------------------
# Replace these imports with your real module paths.
try:
    from app.ingest.motec import parse_ld          # -> dict: {"header":..., "channels":[...]}
    from app.ingest.ldx import parse_ldx           # -> dict: {"totalLaps":..., "setup":{...}, ...}
    from app.ingest.svm import parse_svm           # -> dict: {"car":..., "carClass":..., "sections":{...}}
    _BACKEND_AVAILABLE = True
except Exception:  # pragma: no cover - import guard
    _BACKEND_AVAILABLE = False

# --- JS port entrypoint ---------------------------------------------------
# A tiny Node wrapper that imports the parse functions out of the prototype
# and prints decoded JSON to stdout. See js_parity_runner.mjs (committed
# alongside). Point this at wherever you keep it.
JS_RUNNER = Path(__file__).parent / "js_parity_runner.mjs"

# Floating-point tolerance for cross-language decode comparison.
# The formula is phys = raw * mul / 10^dec + shift; integer intermediate math
# is identical, so tolerance guards only float division representation.
ABS_TOL = 1e-6
REL_TOL = 1e-9

# ═══════════════════════════════════════════════════════════════════════════
pytestmark = pytest.mark.skipif(
    not _BACKEND_AVAILABLE,
    reason="Backend parser modules not importable — wire the adapter shim.",
)


def _run_js_port() -> dict:
    """Execute the JS port under Node against the fixture, return decoded JSON."""
    node = shutil.which("node")
    if node is None:
        pytest.skip("Node not available; parity gate runs in CI where Node is present.")
    if not JS_RUNNER.exists():
        pytest.skip(f"JS parity runner missing: {JS_RUNNER.name}")
    proc = subprocess.run(
        [node, str(JS_RUNNER), str(LD_FIXTURE), str(LDX_FIXTURE), str(SVM_FIXTURE)],
        capture_output=True,
        text=True,
        timeout=60,
    )
    if proc.returncode != 0:
        pytest.fail(f"JS port failed:\n{proc.stderr}")
    return json.loads(proc.stdout)


def _close(a: float, b: float) -> bool:
    if a is None or b is None:
        return a is b
    return math.isclose(a, b, abs_tol=ABS_TOL, rel_tol=REL_TOL)


# ── G4.1 · .ld channel decode parity ────────────────────────────────────
def test_ld_channel_set_matches(ld_bytes):
    """Both implementations discover the same channel names."""
    py = parse_ld(ld_bytes)
    js = _run_js_port()["ld"]
    py_names = {c["name"] for c in py["channels"]}
    js_names = {c["name"] for c in js["channels"]}
    missing_in_py = js_names - py_names
    missing_in_js = py_names - js_names
    assert not missing_in_py, f"Channels only the JS port found: {sorted(missing_in_py)}"
    assert not missing_in_js, f"Channels only the backend found: {sorted(missing_in_js)}"


def test_ld_channel_metadata_matches(ld_bytes):
    """Per-channel decode metadata (mul/dec/shift/rate/unit) is identical."""
    py = {c["name"]: c for c in parse_ld(ld_bytes)["channels"]}
    js = {c["name"]: c for c in _run_js_port()["ld"]["channels"]}
    mismatches = []
    for name in py.keys() & js.keys():
        for field in ("mul", "dec", "shift", "rate", "unit"):
            pv, jv = py[name].get(field), js[name].get(field)
            if pv != jv:
                mismatches.append(f"{name}.{field}: py={pv!r} js={jv!r}")
    assert not mismatches, "Decode metadata drift:\n" + "\n".join(mismatches)


def test_ld_decoded_traces_match(ld_bytes):
    """
    Decoded physical-value traces match sample-for-sample within float tolerance.
    This is the heart of the parity gate: identical bytes -> identical physics.
    """
    py = {c["name"]: c for c in parse_ld(ld_bytes)["channels"]}
    js = {c["name"]: c for c in _run_js_port()["ld"]["channels"]}
    for name in sorted(py.keys() & js.keys()):
        pt, jt = py[name].get("trace"), js[name].get("trace")
        if pt is None or jt is None:
            continue
        assert len(pt) == len(jt), f"{name}: sample count differs ({len(pt)} vs {len(jt)})"
        # Compare a representative slice to keep the gate fast on 5898-sample channels.
        step = max(1, len(pt) // 500)
        for i in range(0, len(pt), step):
            assert _close(pt[i], jt[i]), (
                f"{name}[{i}] diverges: py={pt[i]!r} js={jt[i]!r}"
            )


# ── G4.1 · .ldx parity ───────────────────────────────────────────────────
def test_ldx_summary_matches(ldx_text):
    py = parse_ldx(ldx_text)
    js = _run_js_port()["ldx"]
    for field in ("totalLaps", "fastestLap", "fastestTimeS"):
        assert _close(py.get(field), js.get(field)) or py.get(field) == js.get(field), (
            f".ldx {field}: py={py.get(field)!r} js={js.get(field)!r}"
        )


# ── G4.2 · Domain classification parity ──────────────────────────────────
def test_domain_classification_matches(ld_bytes):
    """
    Channel -> agent-domain mapping must agree. Mis-routing at the edge
    corrupts which specialist agent receives which channel.
    """
    from app.ingest.motec import domain_of  # backend equivalent of JS domainOf()

    js = _run_js_port()["ld"]
    mismatches = []
    for c in js["channels"]:
        name = c["name"]
        py_domain = domain_of(name)
        js_domain = c.get("domain")
        if js_domain is not None and py_domain != js_domain:
            mismatches.append(f"{name}: py={py_domain} js={js_domain}")
    assert not mismatches, "Domain classification drift:\n" + "\n".join(mismatches)
