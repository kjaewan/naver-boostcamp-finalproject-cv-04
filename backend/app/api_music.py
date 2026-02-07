from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from .schemas import MusicSearchResponse
from .services_music import MusicService


router = APIRouter(prefix="/music", tags=["music"])


def get_music_service() -> MusicService:
    from .main import app_state

    return app_state.music_service


@router.get("/search", response_model=MusicSearchResponse)
async def search_music(
    q: str = Query(min_length=1, max_length=120),
    limit: int = Query(default=3, ge=1, le=10),
    music_service: MusicService = Depends(get_music_service),
) -> MusicSearchResponse:
    items = await music_service.search_tracks(query=q, limit=limit)
    return MusicSearchResponse(items=items)
