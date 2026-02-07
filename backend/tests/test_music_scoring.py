from __future__ import annotations

from app.services_music import compute_track_score


def test_compute_track_score_prefers_higher_view_count_when_rank_same() -> None:
    low = compute_track_score(rank_index=0, view_count=1_000)
    high = compute_track_score(rank_index=0, view_count=5_000_000)
    assert high > low


def test_compute_track_score_prefers_better_rank_when_views_equal() -> None:
    top = compute_track_score(rank_index=0, view_count=100_000)
    lower = compute_track_score(rank_index=5, view_count=100_000)
    assert top > lower
