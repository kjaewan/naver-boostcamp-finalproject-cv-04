from __future__ import annotations

import asyncio
import time
import uuid
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from .config import Settings
from .schemas import (
    RenderCreateRequest,
    RenderCreateResponse,
    RenderError,
    RenderResult,
    RenderStatusResponse,
    RenderTrackInfo,
)
from .services_comfy import ComfyError, ComfyService
from .storage import Storage


PHASE_PROGRESS = {
    "queued": 0,
    "preparing": 10,
    "prompting": 25,
    "sampling": 70,
    "assembling": 90,
    "postprocessing": 95,
    "done": 100,
    "error": 100,
}


SAMPLING_PROGRESS_START = PHASE_PROGRESS["sampling"]
SAMPLING_PROGRESS_END = PHASE_PROGRESS["assembling"] - 1


@dataclass
class JobRecord:
    job_id: str
    status: str
    phase: str
    progress: int
    track: dict[str, str]
    result: dict[str, Optional[str]]
    error: dict[str, Optional[str]]
    cache_key: Optional[str]
    image_filename: Optional[str]
    created_at: str
    updated_at: str

    def to_status(self, queue_position: int, estimated_wait_sec: int) -> RenderStatusResponse:
        return RenderStatusResponse(
            job_id=self.job_id,
            status=self.status,  # type: ignore[arg-type]
            phase=self.phase,  # type: ignore[arg-type]
            progress=self.progress,
            queue_position=queue_position,
            estimated_wait_sec=estimated_wait_sec,
            track=RenderTrackInfo(**self.track),
            result=RenderResult(**self.result),
            error=RenderError(**self.error),
        )


class RenderQueueService:
    def __init__(self, settings: Settings, storage: Storage, comfy_service: ComfyService) -> None:
        self.settings = settings
        self.storage = storage
        self.comfy_service = comfy_service
        self.jobs: dict[str, JobRecord] = {}
        self.queue: asyncio.Queue[str] = asyncio.Queue()
        self.lock = asyncio.Lock()
        self.worker_task: Optional[asyncio.Task[None]] = None

    def start(self) -> None:
        self._load_existing_jobs()
        self.worker_task = asyncio.create_task(self._worker(), name="render-queue-worker")

    async def stop(self) -> None:
        if self.worker_task:
            self.worker_task.cancel()
            try:
                await self.worker_task
            except asyncio.CancelledError:
                pass

    def _now(self) -> str:
        return datetime.now(timezone.utc).isoformat()

    def _load_existing_jobs(self) -> None:
        existing = self.storage.load_jobs()
        for job_id, raw in existing.items():
            record = JobRecord(**raw)
            if record.status in {"queued", "processing"}:
                record.status = "failed"
                record.phase = "error"
                record.progress = PHASE_PROGRESS["error"]
                record.error = {
                    "code": "RESTART_INTERRUPTED",
                    "message": "job was interrupted by server restart",
                }
                record.updated_at = self._now()
                self.storage.write_job(job_id, asdict(record))
            self.jobs[job_id] = record

    async def create_job(self, req: RenderCreateRequest) -> RenderCreateResponse:
        album_bytes, ext = await self.storage.download_album_art(req.album_art_url)
        cache_key = self.storage.compute_cache_key(
            album_bytes,
            self.settings.workflow_version,
            self.settings.render_preset,
            album_identity=req.album_id,
        )

        if self.storage.cache_exists(cache_key):
            job_id = str(uuid.uuid4())
            video_url, thumb_url = self.storage.result_urls(cache_key)
            now = self._now()
            job = JobRecord(
                job_id=job_id,
                status="completed",
                phase="done",
                progress=100,
                track={
                    "track_id": req.track_id,
                    "title": req.title,
                    "artist": req.artist,
                    "album_id": req.album_id,
                    "album_art_url": req.album_art_url,
                    "youtube_video_id": req.youtube_video_id,
                },
                result={"video_url": video_url, "thumbnail_url": thumb_url, "cache_key": cache_key},
                error={"code": None, "message": None},
                cache_key=cache_key,
                image_filename=None,
                created_at=now,
                updated_at=now,
            )
            async with self.lock:
                self.jobs[job_id] = job
            self.storage.write_job(job_id, asdict(job))
            return RenderCreateResponse(job_id=job_id, status="completed", cache_hit=True, poll_url=f"/api/v1/renders/{job_id}")

        image_filename = self.storage.persist_album_art(album_bytes, cache_key, ext)

        job_id = str(uuid.uuid4())
        now = self._now()
        job = JobRecord(
            job_id=job_id,
            status="queued",
            phase="queued",
            progress=PHASE_PROGRESS["queued"],
            track={
                "track_id": req.track_id,
                "title": req.title,
                "artist": req.artist,
                "album_id": req.album_id,
                "album_art_url": req.album_art_url,
                "youtube_video_id": req.youtube_video_id,
            },
            result={"video_url": None, "thumbnail_url": None, "cache_key": cache_key},
            error={"code": None, "message": None},
            cache_key=cache_key,
            image_filename=image_filename,
            created_at=now,
            updated_at=now,
        )

        async with self.lock:
            self.jobs[job_id] = job
            await self.queue.put(job_id)
        self.storage.write_job(job_id, asdict(job))

        return RenderCreateResponse(job_id=job_id, status="queued", cache_hit=False, poll_url=f"/api/v1/renders/{job_id}")

    async def get_job(self, job_id: str) -> Optional[RenderStatusResponse]:
        async with self.lock:
            job = self.jobs.get(job_id)
            if not job:
                return None
            queue_position = self._queue_position(job)

        estimated_wait = 0
        if job.status == "queued":
            estimated_wait = max(0, queue_position) * self.settings.estimated_job_sec

        return job.to_status(queue_position=queue_position, estimated_wait_sec=estimated_wait)

    async def list_history(self, limit: int = 6, include_failed: bool = False) -> list[JobRecord]:
        async with self.lock:
            records = list(self.jobs.values())

        if include_failed:
            filtered = [record for record in records if record.status in {"completed", "failed"}]
        else:
            filtered = [record for record in records if record.status == "completed"]

        def sort_key(record: JobRecord) -> tuple[float, float]:
            return (self._parse_iso_timestamp(record.updated_at), self._parse_iso_timestamp(record.created_at))

        filtered.sort(key=sort_key, reverse=True)
        return filtered[:limit]

    async def clear_history(self, include_failed: bool = False) -> int:
        async with self.lock:
            target_ids = [
                job_id
                for job_id, record in self.jobs.items()
                if record.status == "completed" or (include_failed and record.status == "failed")
            ]
            for job_id in target_ids:
                self.jobs.pop(job_id, None)
                self.storage.delete_job(job_id)
        return len(target_ids)

    @staticmethod
    def _parse_iso_timestamp(value: str | None) -> float:
        if not value:
            return 0.0
        try:
            return datetime.fromisoformat(value).timestamp()
        except ValueError:
            return 0.0

    def _queue_position(self, job: JobRecord) -> int:
        if job.status == "processing":
            return 0
        if job.status != "queued":
            return 0

        queued_ids = list(self.queue._queue)  # noqa: SLF001
        try:
            return queued_ids.index(job.job_id) + 1
        except ValueError:
            return 1

    async def _update_phase(self, job_id: str, phase: str) -> None:
        async with self.lock:
            job = self.jobs[job_id]
            job.phase = phase
            job.progress = PHASE_PROGRESS[phase]
            job.updated_at = self._now()
            if phase != "queued":
                job.status = "processing"
            self.storage.write_job(job_id, asdict(job))

    async def _update_sampling_progress(self, job_id: str, ratio: float) -> None:
        ratio = max(0.0, min(1.0, ratio))
        mapped = SAMPLING_PROGRESS_START + int(round((SAMPLING_PROGRESS_END - SAMPLING_PROGRESS_START) * ratio))
        async with self.lock:
            job = self.jobs[job_id]
            if job.phase != "sampling" or job.status not in {"processing", "queued"}:
                return
            if mapped <= job.progress:
                return
            job.progress = mapped
            job.status = "processing"
            job.updated_at = self._now()
            self.storage.write_job(job_id, asdict(job))

    async def _complete_job(self, job_id: str, cache_key: str) -> None:
        video_url, thumb_url = self.storage.result_urls(cache_key)
        async with self.lock:
            job = self.jobs[job_id]
            job.status = "completed"
            job.phase = "done"
            job.progress = PHASE_PROGRESS["done"]
            job.result = {"video_url": video_url, "thumbnail_url": thumb_url, "cache_key": cache_key}
            job.error = {"code": None, "message": None}
            job.updated_at = self._now()
            self.storage.write_job(job_id, asdict(job))

    async def _fail_job(self, job_id: str, code: str, message: str) -> None:
        async with self.lock:
            job = self.jobs[job_id]
            job.status = "failed"
            job.phase = "error"
            job.progress = PHASE_PROGRESS["error"]
            job.error = {"code": code, "message": message}
            job.updated_at = self._now()
            self.storage.write_job(job_id, asdict(job))

    async def _worker(self) -> None:
        while True:
            job_id = await self.queue.get()
            try:
                await self._update_phase(job_id, "preparing")

                async with self.lock:
                    job = self.jobs[job_id]
                    cache_key = job.cache_key
                    image_filename = job.image_filename
                if not cache_key or not image_filename:
                    raise ComfyError("OUTPUT_NOT_FOUND", "missing cache key or image file")

                render_dir = self.storage.ensure_render_dir(cache_key)

                async def phase_callback(phase: str) -> None:
                    await self._update_phase(job_id, phase)

                async def sampling_progress_callback(ratio: float) -> None:
                    await self._update_sampling_progress(job_id, ratio)

                start_ts = time.monotonic()
                video_path, thumb_path = await self.comfy_service.render(
                    image_filename=image_filename,
                    cache_key=cache_key,
                    render_dir=render_dir,
                    phase_callback=phase_callback,
                    sampling_progress_callback=sampling_progress_callback,
                )

                self.storage.write_meta(
                    cache_key,
                    {
                        "track": job.track,
                        "cache_key": cache_key,
                        "video_path": str(video_path),
                        "thumb_path": str(thumb_path),
                        "elapsed_sec": round(time.monotonic() - start_ts, 2),
                        "workflow_version": self.settings.workflow_version,
                        "render_preset": self.settings.render_preset,
                        "created_at": self._now(),
                    },
                )

                await self._complete_job(job_id, cache_key=cache_key)
            except ComfyError as exc:
                await self._fail_job(job_id, exc.code, exc.message)
            except Exception as exc:  # noqa: BLE001
                await self._fail_job(job_id, "COMFY_HTTP_ERROR", str(exc))
            finally:
                self.queue.task_done()
