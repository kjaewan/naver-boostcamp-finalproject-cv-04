from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field


JobStatus = Literal["queued", "processing", "completed", "failed"]
JobPhase = Literal["queued", "preparing", "prompting", "sampling", "assembling", "postprocessing", "done", "error"]


class TrackItem(BaseModel):
    track_id: str
    album_id: Optional[str] = None
    title: str
    artist: str
    album_art_url: str
    youtube_video_id: Optional[str] = None
    youtube_embed_url: Optional[str] = None
    score: float


class MusicSearchResponse(BaseModel):
    items: list[TrackItem]


class RenderCreateRequest(BaseModel):
    track_id: str
    album_id: Optional[str] = None
    title: str
    artist: str
    album_art_url: str
    youtube_video_id: Optional[str] = None


class RenderCreateResponse(BaseModel):
    job_id: str
    status: JobStatus
    cache_hit: bool
    poll_url: str


class RenderTrackInfo(BaseModel):
    track_id: str
    title: str
    artist: str


class RenderResult(BaseModel):
    video_url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    cache_key: Optional[str] = None


class RenderError(BaseModel):
    code: Optional[str] = None
    message: Optional[str] = None


class RenderStatusResponse(BaseModel):
    job_id: str
    status: JobStatus
    phase: JobPhase
    progress: int = Field(ge=0, le=100)
    queue_position: int = Field(ge=0)
    estimated_wait_sec: int = Field(ge=0)
    track: RenderTrackInfo
    result: RenderResult
    error: RenderError
