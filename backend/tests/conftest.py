"""
Shared pytest fixtures for ByteCraft Racing test gates.

Ring 0 (Fixture integrity) is the precondition for everything here:
these fixtures resolve the committed, sanitized .ld/.ldx/.svm triple.
Point FIXTURE_DIR at wherever you commit the anonymized fixture
(Working Plan S1). Nothing downstream runs on unsafe data.
"""
from pathlib import Path
import pytest

# The sanitized fixture triple committed for CI (Ring 0 / Working Plan S1).
# Canonical location per TESTING_GATES.md G0.1: repo-root fixtures/.
FIXTURE_DIR = Path(__file__).parent.parent.parent / "fixtures"

# Sanitized COTA / Ferrari 488 GTE Evo session (driver name scrubbed,
# GPS left in game-world coordinate space — see G0.2).
LD_FIXTURE = FIXTURE_DIR / "cota_gte_sanitized.ld"
LDX_FIXTURE = FIXTURE_DIR / "cota_gte_sanitized.ldx"
SVM_FIXTURE = FIXTURE_DIR / "cota_gte_sanitized.svm"


def _require(path: Path) -> Path:
    if not path.exists():
        pytest.skip(
            f"Ring 0 fixture missing: {path.name}. "
            "Commit the sanitized fixture (Working Plan S1) before these gates can run."
        )
    return path


@pytest.fixture
def ld_bytes() -> bytes:
    return _require(LD_FIXTURE).read_bytes()


@pytest.fixture
def ldx_text() -> str:
    return _require(LDX_FIXTURE).read_text(encoding="utf-8", errors="replace")


@pytest.fixture
def svm_text() -> str:
    return _require(SVM_FIXTURE).read_text(encoding="utf-8", errors="replace")
