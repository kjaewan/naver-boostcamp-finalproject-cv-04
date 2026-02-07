from __future__ import annotations

import hashlib
import json
import mimetypes
import shutil
from pathlib import Path
from typing import Any

import httpx

from .config import Settings


class Storage:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.ensure_directories()

    def ensure_directories(self) -> None:
        for path in (
            self.settings.data_dir,
            self.settings.inputs_dir,
            self.settings.renders_dir,
            self.settings.jobs_dir,
            self.settings.comfy_input_dir,
        ):
            path.mkdir(parents=True, exist_ok=True)

    @staticmethod
    def compute_cache_key(
        album_art_bytes: bytes,
        workflow_version: str,
        render_preset: str,
        album_identity: str | None = None,
    ) -> str:
        digest = hashlib.sha256()
        if album_identity:
            digest.update(f"album:{album_identity}".encode("utf-8"))
        else:
            digest.update(album_art_bytes)
        digest.update(workflow_version.encode("utf-8"))
        digest.update(render_preset.encode("utf-8"))
        return digest.hexdigest()

    def render_dir(self, cache_key: str) -> Path:
        return self.settings.renders_dir / cache_key

    def cache_exists(self, cache_key: str) -> bool:
        render_dir = self.render_dir(cache_key)
        return (render_dir / "video.mp4").exists() and (render_dir / "meta.json").exists()

    def result_urls(self, cache_key: str) -> tuple[str, str]:
        return (
            f"/static/renders/{cache_key}/video.mp4",
            f"/static/renders/{cache_key}/thumb.jpg",
        )

    async def download_album_art(self, album_art_url: str, timeout_sec: int = 30) -> tuple[bytes, str]:
        async with httpx.AsyncClient(timeout=timeout_sec) as client:
            response = await client.get(album_art_url)
            response.raise_for_status()

        content_type = response.headers.get("content-type", "").split(";")[0].strip()
        ext = mimetypes.guess_extension(content_type) or ".jpg"
        if ext == ".jpe":
            ext = ".jpg"

        return response.content, ext

    def persist_album_art(self, content: bytes, cache_key: str, ext: str) -> str:
        filename = f"album_{cache_key}{ext}"
        local_input = self.settings.inputs_dir / filename
        comfy_input = self.settings.comfy_input_dir / filename

        local_input.write_bytes(content)
        shutil.copy2(local_input, comfy_input)

        return filename

    def ensure_render_dir(self, cache_key: str) -> Path:
        render_dir = self.render_dir(cache_key)
        render_dir.mkdir(parents=True, exist_ok=True)
        return render_dir

    def write_meta(self, cache_key: str, data: dict[str, Any]) -> None:
        render_dir = self.ensure_render_dir(cache_key)
        meta_path = render_dir / "meta.json"
        meta_path.write_text(json.dumps(data, ensure_ascii=True, indent=2), encoding="utf-8")

    def write_job(self, job_id: str, data: dict[str, Any]) -> None:
        path = self.settings.jobs_dir / f"{job_id}.json"
        path.write_text(json.dumps(data, ensure_ascii=True, indent=2), encoding="utf-8")

    def delete_job(self, job_id: str) -> None:
        path = self.settings.jobs_dir / f"{job_id}.json"
        if path.exists():
            path.unlink()

    def load_jobs(self) -> dict[str, dict[str, Any]]:
        jobs: dict[str, dict[str, Any]] = {}
        for path in self.settings.jobs_dir.glob("*.json"):
            try:
                jobs[path.stem] = json.loads(path.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                continue
        return jobs
