from __future__ import annotations

import asyncio
from typing import Optional

from app.services_music import MusicService


class StubYouTubeService:
    def __init__(self) -> None:
        self.calls = 0

    async def lookup_track(self, title: str, artist: str) -> tuple[Optional[str], Optional[str], int]:  # noqa: ARG002
        self.calls += 1
        video_id = f"vid-{self.calls}"
        return video_id, f"https://www.youtube.com/embed/{video_id}", 10_000


def _itunes_rows(count: int) -> list[dict[str, object]]:
    return [
        {
            "trackId": idx,
            "trackName": f"Track {idx}",
            "artistName": f"Artist {idx}",
            "artworkUrl100": "https://example.com/a/100x100bb.jpg",
        }
        for idx in range(1, count + 1)
    ]


def test_search_tracks_limits_lookup_to_configured_top_k() -> None:
    stub = StubYouTubeService()
    service = MusicService(youtube_service=stub, youtube_lookup_top_k=1)

    async def fake_itunes_search(_query: str) -> list[dict[str, object]]:
        return _itunes_rows(10)

    service._itunes_search = fake_itunes_search  # type: ignore[method-assign]

    items = asyncio.run(service.search_tracks("beautiful", limit=3))

    assert len(items) == 3
    assert stub.calls == 1


def test_search_tracks_can_disable_youtube_lookup() -> None:
    stub = StubYouTubeService()
    service = MusicService(youtube_service=stub, youtube_lookup_top_k=0)

    async def fake_itunes_search(_query: str) -> list[dict[str, object]]:
        return _itunes_rows(10)

    service._itunes_search = fake_itunes_search  # type: ignore[method-assign]

    items = asyncio.run(service.search_tracks("beautiful", limit=3))

    assert len(items) == 3
    assert stub.calls == 0
