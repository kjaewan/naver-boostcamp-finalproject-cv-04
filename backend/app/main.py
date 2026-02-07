from __future__ import annotations

import logging
from dataclasses import dataclass

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .api_music import router as music_router
from .api_renders import router as renders_router
from .config import get_settings
from .services_comfy import ComfyService
from .services_music import MusicService
from .services_queue import RenderQueueService
from .services_youtube import YouTubeService
from .storage import Storage


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@dataclass
class AppState:
    storage: Storage
    youtube_service: YouTubeService
    music_service: MusicService
    comfy_service: ComfyService
    queue_service: RenderQueueService


settings = get_settings()

storage = Storage(settings)
youtube_service = YouTubeService(
    api_key=settings.youtube_api_key,
    cache_ttl_sec=settings.youtube_cache_ttl_sec,
    cache_max_size=settings.youtube_cache_max_size,
)
music_service = MusicService(
    youtube_service=youtube_service,
    youtube_lookup_top_k=settings.youtube_lookup_top_k,
)
comfy_service = ComfyService(settings=settings)
queue_service = RenderQueueService(settings=settings, storage=storage, comfy_service=comfy_service)

app_state = AppState(
    storage=storage,
    youtube_service=youtube_service,
    music_service=music_service,
    comfy_service=comfy_service,
    queue_service=queue_service,
)

app = FastAPI(title="Music Search + Live2D Render API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory=str(settings.data_dir)), name="static")

app.include_router(music_router, prefix=settings.api_prefix)
app.include_router(renders_router, prefix=settings.api_prefix)


@app.on_event("startup")
async def on_startup() -> None:
    logger.info("starting queue worker")
    queue_service.start()


@app.on_event("shutdown")
async def on_shutdown() -> None:
    logger.info("stopping queue worker")
    await queue_service.stop()


@app.get("/")
async def health() -> dict[str, str]:
    return {"status": "ok"}
