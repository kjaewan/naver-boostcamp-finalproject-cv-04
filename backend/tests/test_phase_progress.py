from __future__ import annotations

from app.services_queue import PHASE_PROGRESS


def test_phase_progress_mapping() -> None:
    assert PHASE_PROGRESS["queued"] == 0
    assert PHASE_PROGRESS["sampling"] == 70
    assert PHASE_PROGRESS["done"] == 100
    assert PHASE_PROGRESS["error"] == 100
