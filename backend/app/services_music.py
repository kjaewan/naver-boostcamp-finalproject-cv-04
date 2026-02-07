from __future__ import annotations

import asyncio
import math
from typing import Any

import httpx

from .schemas import TrackItem
from .services_youtube import YouTubeService


def compute_track_score(rank_index: int, view_count: int) -> float:
    rank_component = max(0.0, 1.0 - (rank_index * 0.06))
    youtube_component = min(1.0, math.log10(view_count + 1) / 8.0) if view_count > 0 else 0.0
    return round((rank_component * 0.7) + (youtube_component * 0.3), 6)


class MusicService:
    ITUNES_URL = "https://itunes.apple.com/search"

    def __init__(self, youtube_service: YouTubeService, youtube_lookup_top_k: int = 1) -> None:
        self.youtube_service = youtube_service
        self.youtube_lookup_top_k = max(0, min(youtube_lookup_top_k, 10))

    async def _itunes_search(self, query: str) -> list[dict[str, Any]]:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                self.ITUNES_URL,
                params={
                    "term": query,
                    "entity": "song",
                    "limit": 25,
                },
            )
            resp.raise_for_status()
            payload = resp.json()
        return payload.get("results", [])

    async def search_tracks(self, query: str, limit: int = 3) -> list[TrackItem]:
        itunes_results = await self._itunes_search(query)
        if not itunes_results:
            return []

        limit = max(1, min(limit, 10))
        candidates = []
        seen: set[str] = set()
        for item in itunes_results:
            track_id = str(item.get("trackId") or "")
            album_id_raw = item.get("collectionId")
            album_id = str(album_id_raw) if album_id_raw is not None else None
            title = str(item.get("trackName") or "").strip()
            artist = str(item.get("artistName") or "").strip()
            artwork = str(item.get("artworkUrl100") or "").strip()
            if not track_id or not title or not artist or not artwork or track_id in seen:
                continue
            seen.add(track_id)
            artwork = artwork.replace("100x100bb", "600x600bb")
            candidates.append(
                {
                    "track_id": track_id,
                    "album_id": album_id,
                    "title": title,
                    "artist": artist,
                    "album_art_url": artwork,
                }
            )

        if not candidates:
            return []

        candidate_window = min(len(candidates), max(limit, self.youtube_lookup_top_k))
        scoped_candidates = candidates[:candidate_window]
        lookup_count = min(self.youtube_lookup_top_k, candidate_window)

        lookups = [
            self.youtube_service.lookup_track(candidate["title"], candidate["artist"])
            for candidate in scoped_candidates[:lookup_count]
        ]
        youtube_results = await asyncio.gather(*lookups, return_exceptions=True) if lookups else []

        ranked_items: list[TrackItem] = []
        for rank, candidate in enumerate(scoped_candidates):
            youtube_video_id = None
            youtube_embed_url = None
            view_count = 0
            if rank < lookup_count:
                lookup_result = youtube_results[rank]
                if not isinstance(lookup_result, Exception):
                    youtube_video_id, youtube_embed_url, view_count = lookup_result

            score = compute_track_score(rank, view_count)
            ranked_items.append(
                TrackItem(
                    track_id=candidate["track_id"],
                    album_id=candidate.get("album_id"),
                    title=candidate["title"],
                    artist=candidate["artist"],
                    album_art_url=candidate["album_art_url"],
                    youtube_video_id=youtube_video_id,
                    youtube_embed_url=youtube_embed_url,
                    score=score,
                )
            )

        ranked_items.sort(key=lambda item: item.score, reverse=True)
        return ranked_items[:limit]
