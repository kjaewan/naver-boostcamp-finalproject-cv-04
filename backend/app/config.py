from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

try:
    from dotenv import load_dotenv
except ImportError:  # pragma: no cover
    load_dotenv = None


@dataclass(frozen=True)
class Settings:
    project_root: Path
    api_prefix: str
    comfy_base_url: str
    comfy_input_dir: Path
    comfy_workflow_path: Path
    data_dir: Path
    inputs_dir: Path
    renders_dir: Path
    jobs_dir: Path
    youtube_api_key: str
    youtube_lookup_top_k: int
    youtube_cache_ttl_sec: int
    youtube_cache_max_size: int
    workflow_version: str
    render_preset: str
    render_timeout_sec: int
    polling_interval_sec: int
    estimated_job_sec: int


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    project_root = Path(__file__).resolve().parents[2]
    data_dir = project_root / "data"
    env_path = project_root / ".env"

    if load_dotenv is not None and env_path.exists():
        load_dotenv(env_path, override=False)

    comfy_input_dir_raw = os.getenv("COMFY_INPUT_DIR", str(project_root.parent / "ComfyUI" / "input"))
    workflow_file = os.getenv("WORKFLOW_FILE", "(API)Final_workflow.json")
    comfy_workflow_path_raw = os.getenv("COMFY_WORKFLOW_PATH", f"workflows/{workflow_file}")

    comfy_input_dir = Path(comfy_input_dir_raw).expanduser()
    if not comfy_input_dir.is_absolute():
        comfy_input_dir = (project_root / comfy_input_dir).resolve()

    comfy_workflow_path = Path(comfy_workflow_path_raw).expanduser()
    if not comfy_workflow_path.is_absolute():
        comfy_workflow_path = (project_root / comfy_workflow_path).resolve()

    return Settings(
        project_root=project_root,
        api_prefix=os.getenv("API_PREFIX", "/api/v1"),
        comfy_base_url=os.getenv("COMFY_BASE_URL", "http://127.0.0.1:8188").rstrip("/"),
        comfy_input_dir=comfy_input_dir,
        comfy_workflow_path=comfy_workflow_path,
        data_dir=data_dir,
        inputs_dir=data_dir / "inputs",
        renders_dir=data_dir / "renders",
        jobs_dir=data_dir / "jobs",
        youtube_api_key=os.getenv("YOUTUBE_API_KEY", ""),
        youtube_lookup_top_k=int(os.getenv("YOUTUBE_LOOKUP_TOP_K", "1")),
        youtube_cache_ttl_sec=int(os.getenv("YOUTUBE_CACHE_TTL_SEC", "86400")),
        youtube_cache_max_size=int(os.getenv("YOUTUBE_CACHE_MAX_SIZE", "2000")),
        workflow_version=os.getenv("WORKFLOW_VERSION", "qwen_enhancer_v1"),
        render_preset=os.getenv("RENDER_PRESET", "mp4_loop_v1"),
        render_timeout_sec=int(os.getenv("RENDER_TIMEOUT_SEC", "900")),
        polling_interval_sec=int(os.getenv("POLLING_INTERVAL_SEC", "3")),
        estimated_job_sec=int(os.getenv("ESTIMATED_JOB_SEC", "300")),
    )
