from __future__ import annotations

import asyncio
import copy
import json
import logging
import subprocess
import time
import uuid
from pathlib import Path
from typing import Any, Awaitable, Callable, Optional
from urllib.parse import urlencode, urlparse, urlunparse

import httpx
try:
    import websockets
except ImportError:  # pragma: no cover
    websockets = None

from .config import Settings


logger = logging.getLogger(__name__)

PhaseCallback = Callable[[str], Awaitable[None]]
SamplingProgressCallback = Callable[[float], Awaitable[None]]


class ComfyError(RuntimeError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


class ComfyService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._workflow_template = self._load_workflow_template()

    def _load_workflow_template(self) -> dict[str, Any]:
        return json.loads(self.settings.comfy_workflow_path.read_text(encoding="utf-8"))

    def build_prompt(self, image_filename: str, cache_key: str) -> dict[str, Any]:
        prompt = copy.deepcopy(self._workflow_template)
        prompt["58"]["inputs"]["image"] = image_filename
        prompt["341"]["inputs"]["filename_prefix"] = f"Live2D/{cache_key}"
        return prompt

    async def _post_prompt(self, prompt: dict[str, Any], client_id: str) -> str:
        payload = {
            "prompt": prompt,
            "client_id": client_id,
        }
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                resp = await client.post(f"{self.settings.comfy_base_url}/prompt", json=payload)
                resp.raise_for_status()
                data = resp.json()
            node_errors = data.get("node_errors")
            if isinstance(node_errors, dict) and node_errors:
                details = self._summarize_node_errors(node_errors)
                raise ComfyError("COMFY_WORKFLOW_INVALID", details)
            return str(data["prompt_id"])
        except Exception as exc:  # noqa: BLE001
            if isinstance(exc, ComfyError):
                raise
            raise ComfyError("COMFY_HTTP_ERROR", f"failed to queue prompt: {exc}") from exc

    def _build_ws_url(self, client_id: str) -> str:
        parsed = urlparse(self.settings.comfy_base_url)
        scheme = "wss" if parsed.scheme == "https" else "ws"
        ws_path = f"{parsed.path.rstrip('/')}/ws"
        query = urlencode({"clientId": client_id})
        return urlunparse((scheme, parsed.netloc, ws_path, "", query, ""))

    @staticmethod
    def _as_float(value: Any) -> float:
        try:
            return float(value)
        except (TypeError, ValueError):
            return 0.0

    @staticmethod
    def _clamp_ratio(value: float) -> float:
        return max(0.0, min(1.0, value))

    def _extract_sampling_ratio(self, message_type: str, payload: dict[str, Any]) -> Optional[float]:
        if message_type == "progress":
            max_value = self._as_float(payload.get("max"))
            current_value = self._as_float(payload.get("value"))
            if max_value <= 1:
                return None
            return self._clamp_ratio(current_value / max_value)

        if message_type != "progress_state":
            return None

        nodes = payload.get("nodes")
        if not isinstance(nodes, dict):
            return None

        best_ratio: Optional[float] = None
        best_rank = -1.0
        for node in nodes.values():
            if not isinstance(node, dict):
                continue
            max_value = self._as_float(node.get("max"))
            if max_value <= 1:
                continue
            current_value = self._as_float(node.get("value"))
            state = str(node.get("state", ""))
            ratio = self._clamp_ratio(current_value / max_value)
            state_rank = 2 if state == "running" else 1 if state == "finished" else 0
            rank = state_rank * 1_000_000 + max_value
            if rank > best_rank:
                best_rank = rank
                best_ratio = ratio
        return best_ratio

    async def _stream_sampling_progress(
        self,
        client_id: str,
        prompt_id_ref: dict[str, Optional[str]],
        sampling_progress_callback: SamplingProgressCallback,
    ) -> None:
        if websockets is None:
            return

        ws_url = self._build_ws_url(client_id)
        try:
            async with websockets.connect(
                ws_url,
                open_timeout=15,
                close_timeout=3,
                ping_interval=20,
                ping_timeout=20,
            ) as ws:
                while True:
                    raw = await ws.recv()
                    if not isinstance(raw, str):
                        continue

                    try:
                        message = json.loads(raw)
                    except json.JSONDecodeError:
                        continue

                    message_type = str(message.get("type", ""))
                    payload = message.get("data")
                    if not isinstance(payload, dict):
                        continue

                    target_prompt_id = prompt_id_ref.get("value")
                    payload_prompt_id = payload.get("prompt_id")
                    if payload_prompt_id is not None:
                        payload_prompt_id = str(payload_prompt_id)

                    if not target_prompt_id:
                        continue
                    if target_prompt_id and payload_prompt_id and payload_prompt_id != target_prompt_id:
                        continue

                    sampling_ratio = self._extract_sampling_ratio(message_type, payload)
                    if sampling_ratio is not None:
                        await sampling_progress_callback(sampling_ratio)

                    if (
                        target_prompt_id
                        and payload_prompt_id == target_prompt_id
                        and message_type in {"execution_success", "execution_error", "execution_interrupted"}
                    ):
                        break
                    if (
                        target_prompt_id
                        and payload_prompt_id == target_prompt_id
                        and message_type == "executing"
                        and payload.get("node") is None
                    ):
                        break
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001
            logger.debug("failed to stream Comfy progress: %s", exc)

    async def _get_history(self, prompt_id: str) -> Optional[dict[str, Any]]:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(f"{self.settings.comfy_base_url}/history/{prompt_id}")
            resp.raise_for_status()
            data = resp.json()
        return data.get(prompt_id)

    async def _wait_for_history(self, prompt_id: str, timeout_sec: int) -> dict[str, Any]:
        start = time.monotonic()
        while True:
            history = await self._get_history(prompt_id)
            if history and history.get("outputs"):
                return history
            if time.monotonic() - start > timeout_sec:
                raise ComfyError("COMFY_TIMEOUT", f"prompt timed out in {timeout_sec}s")
            await asyncio.sleep(2)

    @staticmethod
    def _iter_output_files(node_output: dict[str, Any]) -> list[dict[str, Any]]:
        files: list[dict[str, Any]] = []
        for key in ("videos", "gifs", "images"):
            value = node_output.get(key)
            if isinstance(value, list):
                for item in value:
                    if isinstance(item, dict) and item.get("filename"):
                        files.append(item)
        return files

    def _extract_video_file(self, history_item: dict[str, Any]) -> dict[str, Any]:
        status = history_item.get("status", {})
        if isinstance(status, dict) and status.get("status_str") == "error":
            raise ComfyError("COMFY_EXEC_ERROR", self._summarize_execution_error(status))

        outputs = history_item.get("outputs", {})

        preferred_node = outputs.get("341", {})
        preferred_files = self._iter_output_files(preferred_node)
        if preferred_files:
            return preferred_files[0]

        for node_output in outputs.values():
            files = self._iter_output_files(node_output)
            if files:
                return files[0]

        raise ComfyError("OUTPUT_NOT_FOUND", "no output file in ComfyUI history")

    @staticmethod
    def _summarize_node_errors(node_errors: dict[str, Any]) -> str:
        chunks: list[str] = []
        for node_id, value in node_errors.items():
            if not isinstance(value, dict):
                continue
            class_type = str(value.get("class_type", "unknown"))
            errs = value.get("errors") or []
            if isinstance(errs, list) and errs:
                first = errs[0]
                if isinstance(first, dict):
                    msg = str(first.get("details") or first.get("message") or "validation error")
                else:
                    msg = str(first)
            else:
                msg = "validation error"
            chunks.append(f"node {node_id} ({class_type}): {msg}")
        return "workflow validation failed: " + "; ".join(chunks[:3])

    @staticmethod
    def _summarize_execution_error(status: dict[str, Any]) -> str:
        messages = status.get("messages") or []
        if not isinstance(messages, list):
            return "execution failed without details"

        for item in reversed(messages):
            if not isinstance(item, list) or len(item) < 2:
                continue
            event_type = item[0]
            payload = item[1] if isinstance(item[1], dict) else {}
            if event_type != "execution_error":
                continue

            node_id = str(payload.get("node_id", "?"))
            node_type = str(payload.get("node_type", "unknown"))
            exception_message = str(payload.get("exception_message", "execution_error")).strip()
            if exception_message:
                return f"node {node_id} ({node_type}): {exception_message}"
            return f"node {node_id} ({node_type}): execution error"

        return "execution failed without details"

    async def _download_output(self, file_ref: dict[str, Any], target_path: Path) -> None:
        query = urlencode(
            {
                "filename": file_ref.get("filename", ""),
                "subfolder": file_ref.get("subfolder", ""),
                "type": file_ref.get("type", "output"),
            }
        )
        url = f"{self.settings.comfy_base_url}/view?{query}"

        try:
            async with httpx.AsyncClient(timeout=90) as client:
                resp = await client.get(url)
                resp.raise_for_status()
                target_path.write_bytes(resp.content)
        except Exception as exc:  # noqa: BLE001
            raise ComfyError("DOWNLOAD_FAILED", f"failed to download output: {exc}") from exc

    def _ensure_mp4(self, downloaded_path: Path, final_video_path: Path) -> None:
        if downloaded_path.suffix.lower() == ".mp4":
            if downloaded_path.resolve() == final_video_path.resolve():
                return
            downloaded_path.replace(final_video_path)
            return

        cmd = [
            "ffmpeg",
            "-y",
            "-i",
            str(downloaded_path),
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            str(final_video_path),
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            raise ComfyError("DOWNLOAD_FAILED", f"ffmpeg convert failed: {result.stderr[-300:]}")

    def make_thumbnail(self, video_path: Path, thumb_path: Path) -> None:
        cmd = [
            "ffmpeg",
            "-y",
            "-i",
            str(video_path),
            "-vf",
            "thumbnail,scale=640:-1",
            "-frames:v",
            "1",
            str(thumb_path),
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            raise ComfyError("DOWNLOAD_FAILED", f"thumbnail generation failed: {result.stderr[-300:]}")

    async def render(
        self,
        image_filename: str,
        cache_key: str,
        render_dir: Path,
        phase_callback: Optional[PhaseCallback] = None,
        sampling_progress_callback: Optional[SamplingProgressCallback] = None,
    ) -> tuple[Path, Path]:
        if phase_callback:
            await phase_callback("prompting")
        prompt = self.build_prompt(image_filename=image_filename, cache_key=cache_key)
        client_id = uuid.uuid4().hex
        prompt_id_ref: dict[str, Optional[str]] = {"value": None}
        sampling_task: Optional[asyncio.Task[None]] = None
        if sampling_progress_callback:
            sampling_task = asyncio.create_task(
                self._stream_sampling_progress(
                    client_id=client_id,
                    prompt_id_ref=prompt_id_ref,
                    sampling_progress_callback=sampling_progress_callback,
                )
            )

        try:
            prompt_id = await self._post_prompt(prompt, client_id=client_id)
            prompt_id_ref["value"] = prompt_id

            if phase_callback:
                await phase_callback("sampling")
            history = await self._wait_for_history(prompt_id, timeout_sec=self.settings.render_timeout_sec)
        finally:
            if sampling_task:
                sampling_task.cancel()
                try:
                    await sampling_task
                except asyncio.CancelledError:
                    pass

        if phase_callback:
            await phase_callback("assembling")
        output_ref = self._extract_video_file(history)
        source_name = Path(str(output_ref.get("filename", "output.mp4"))).name
        downloaded_path = render_dir / source_name
        await self._download_output(output_ref, downloaded_path)

        if phase_callback:
            await phase_callback("postprocessing")
        final_video_path = render_dir / "video.mp4"
        self._ensure_mp4(downloaded_path, final_video_path)
        thumb_path = render_dir / "thumb.jpg"
        self.make_thumbnail(final_video_path, thumb_path)

        return final_video_path, thumb_path
