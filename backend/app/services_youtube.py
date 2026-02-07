from __future__ import annotations

import time
from collections import OrderedDict
import logging
from typing import Optional

import httpx


logger = logging.getLogger(__name__)


class YouTubeService:
    SEARCH_URL = "https://www.googleapis.com/youtube/v3/search"
    VIDEOS_URL = "https://www.googleapis.com/youtube/v3/videos"

    def __init__(self, api_key: str, cache_ttl_sec: int = 86_400, cache_max_size: int = 2_000) -> None:
        self.api_key = api_key
        self.cache_ttl_sec = max(0, cache_ttl_sec)
        self.cache_max_size = max(0, cache_max_size)
        self.cache: OrderedDict[str, tuple[float, tuple[Optional[str], Optional[str], int]]] = OrderedDict()

    @staticmethod
    def _normalize(value: str) -> str:
        return " ".join(value.lower().split())

    def _cache_key(self, title: str, artist: str) -> str:
        return f"{self._normalize(title)}::{self._normalize(artist)}"

    def _cache_get(self, key: str) -> Optional[tuple[Optional[str], Optional[str], int]]:
        if self.cache_ttl_sec <= 0 or self.cache_max_size <= 0:
            return None

        entry = self.cache.get(key)
        if not entry:
            return None

        created_ts, result = entry
        if (time.monotonic() - created_ts) > self.cache_ttl_sec:
            self.cache.pop(key, None)
            return None

        self.cache.move_to_end(key)
        return result

    def _cache_set(self, key: str, result: tuple[Optional[str], Optional[str], int]) -> None:
        if self.cache_ttl_sec <= 0 or self.cache_max_size <= 0:
            return

        self.cache[key] = (time.monotonic(), result)
        self.cache.move_to_end(key)

        while len(self.cache) > self.cache_max_size:
            self.cache.popitem(last=False)

    async def lookup_track(self, title: str, artist: str) -> tuple[Optional[str], Optional[str], int]:
        cache_key = self._cache_key(title, artist)
        cached = self._cache_get(cache_key)
        if cached is not None:
            return cached

        if not self.api_key:
            return None, None, 0

        query = f"{title} {artist} official audio"

        try:
            async with httpx.AsyncClient(timeout=12) as client:
                search_resp = await client.get(
                    self.SEARCH_URL,
                    params={
                        "part": "snippet",
                        "q": query,
                        "type": "video",
                        "maxResults": 3,
                        "videoEmbeddable": "true",
                        "key": self.api_key,
                    },
                )
                search_resp.raise_for_status()
                search_data = search_resp.json()

                video_ids = [item["id"]["videoId"] for item in search_data.get("items", []) if item.get("id", {}).get("videoId")]
                if not video_ids:
                    return None, None, 0

                stats_resp = await client.get(
                    self.VIDEOS_URL,
                    params={
                        "part": "statistics",
                        "id": ",".join(video_ids),
                        "key": self.api_key,
                    },
                )
                stats_resp.raise_for_status()
                stats_data = stats_resp.json()

            views_by_id: dict[str, int] = {}
            for item in stats_data.get("items", []):
                video_id = item.get("id")
                view_count = int(item.get("statistics", {}).get("viewCount", 0))
                if video_id:
                    views_by_id[video_id] = view_count

            best_id = max(video_ids, key=lambda vid: views_by_id.get(vid, 0))
            best_views = views_by_id.get(best_id, 0)
            result = (best_id, f"https://www.youtube.com/embed/{best_id}", best_views)
            self._cache_set(cache_key, result)
            return result
        except Exception as exc:  # noqa: BLE001
            logger.warning("youtube lookup failed: %s", exc)
            result = (None, None, 0)
            self._cache_set(cache_key, result)
            return result
