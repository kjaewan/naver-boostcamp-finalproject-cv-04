from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app, queue_service
from app.services_queue import PHASE_PROGRESS, JobRecord


client = TestClient(app)


def test_health() -> None:
    response = client.get("/")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_get_missing_job_returns_404() -> None:
    response = client.get("/api/v1/renders/not-found")
    assert response.status_code == 404


def test_cache_hit_path(tmp_path: Path, monkeypatch) -> None:
    cache_key = "abc123"

    async def fake_download(_url: str, timeout_sec: int = 30):  # noqa: ARG001
        return (b"img", ".jpg")

    monkeypatch.setattr(queue_service.storage, "download_album_art", fake_download)
    monkeypatch.setattr(
        queue_service.storage,
        "compute_cache_key",
        lambda *args, **kwargs: cache_key,
    )
    monkeypatch.setattr(queue_service.storage, "cache_exists", lambda key: key == cache_key)
    monkeypatch.setattr(
        queue_service.storage,
        "result_urls",
        lambda key: (f"/static/renders/{key}/video.mp4", f"/static/renders/{key}/thumb.jpg"),
    )

    payload = {
        "track_id": "1",
        "title": "Song",
        "artist": "Artist",
        "album_art_url": "https://example.com/a.jpg",
        "youtube_video_id": None,
    }

    response = client.post("/api/v1/renders", json=payload)
    assert response.status_code == 202
    data = response.json()
    assert data["cache_hit"] is True
    assert data["status"] == "completed"


def test_cache_hit_uses_legacy_album_identity_cache_key(monkeypatch) -> None:
    album_id = "album-123"
    image_bytes = b"img"

    async def fake_download(_url: str, timeout_sec: int = 30):  # noqa: ARG001
        return (image_bytes, ".jpg")

    content_key = queue_service.storage.compute_cache_key(
        image_bytes,
        queue_service.settings.workflow_version,
        queue_service.settings.render_preset,
    )
    legacy_key = queue_service.storage.compute_album_identity_cache_key(
        album_id,
        queue_service.settings.workflow_version,
        queue_service.settings.render_preset,
    )
    assert content_key != legacy_key

    def fake_cache_exists(key: str) -> bool:
        return key == legacy_key

    def fail_persist(*_args, **_kwargs) -> str:
        raise AssertionError("persist_album_art should not be called for cache hit")

    monkeypatch.setattr(queue_service.storage, "download_album_art", fake_download)
    monkeypatch.setattr(queue_service.storage, "cache_exists", fake_cache_exists)
    monkeypatch.setattr(
        queue_service.storage,
        "result_urls",
        lambda key: (f"/static/renders/{key}/video.mp4", f"/static/renders/{key}/thumb.jpg"),
    )
    monkeypatch.setattr(queue_service.storage, "persist_album_art", fail_persist)

    payload = {
        "track_id": "2",
        "album_id": album_id,
        "title": "Another Song",
        "artist": "Artist",
        "album_art_url": "https://example.com/a.jpg",
        "youtube_video_id": None,
    }

    response = client.post("/api/v1/renders", json=payload)
    assert response.status_code == 202
    data = response.json()
    assert data["cache_hit"] is True
    assert data["status"] == "completed"

    status_response = client.get(f"/api/v1/renders/{data['job_id']}")
    assert status_response.status_code == 200
    assert status_response.json()["result"]["cache_key"] == legacy_key


def test_render_history_completed_only(monkeypatch) -> None:
    monkeypatch.setattr(
        queue_service,
        "jobs",
        {
            "job-old": JobRecord(
                job_id="job-old",
                status="completed",
                phase="done",
                progress=100,
                track={"track_id": "1", "title": "Old Song", "artist": "Artist A"},
                result={"video_url": "/v1.mp4", "thumbnail_url": "/t1.jpg", "cache_key": "k1"},
                error={"code": None, "message": None},
                cache_key="k1",
                image_filename="a.jpg",
                created_at="2026-02-07T09:00:00+00:00",
                updated_at="2026-02-07T09:10:00+00:00",
            ),
            "job-failed": JobRecord(
                job_id="job-failed",
                status="failed",
                phase="error",
                progress=100,
                track={"track_id": "2", "title": "Failed Song", "artist": "Artist B"},
                result={"video_url": None, "thumbnail_url": None, "cache_key": "k2"},
                error={"code": "X", "message": "failed"},
                cache_key="k2",
                image_filename="b.jpg",
                created_at="2026-02-07T10:00:00+00:00",
                updated_at="2026-02-07T10:05:00+00:00",
            ),
            "job-new": JobRecord(
                job_id="job-new",
                status="completed",
                phase="done",
                progress=100,
                track={"track_id": "3", "title": "New Song", "artist": "Artist C"},
                result={"video_url": "/v3.mp4", "thumbnail_url": "/t3.jpg", "cache_key": "k3"},
                error={"code": None, "message": None},
                cache_key="k3",
                image_filename="c.jpg",
                created_at="2026-02-07T11:00:00+00:00",
                updated_at="2026-02-07T11:10:00+00:00",
            ),
        },
    )

    response = client.get("/api/v1/renders/history?limit=2")
    assert response.status_code == 200
    items = response.json()["items"]
    assert len(items) == 2
    assert [item["job_id"] for item in items] == ["job-new", "job-old"]


def test_render_history_include_failed(monkeypatch) -> None:
    monkeypatch.setattr(
        queue_service,
        "jobs",
        {
            "job-completed": JobRecord(
                job_id="job-completed",
                status="completed",
                phase="done",
                progress=100,
                track={"track_id": "1", "title": "Song", "artist": "Artist"},
                result={"video_url": "/v.mp4", "thumbnail_url": "/t.jpg", "cache_key": "k"},
                error={"code": None, "message": None},
                cache_key="k",
                image_filename="a.jpg",
                created_at="2026-02-07T09:00:00+00:00",
                updated_at="2026-02-07T09:10:00+00:00",
            ),
            "job-failed": JobRecord(
                job_id="job-failed",
                status="failed",
                phase="error",
                progress=100,
                track={"track_id": "2", "title": "Fail", "artist": "Artist"},
                result={"video_url": None, "thumbnail_url": None, "cache_key": "kf"},
                error={"code": "ERR", "message": "x"},
                cache_key="kf",
                image_filename="b.jpg",
                created_at="2026-02-07T10:00:00+00:00",
                updated_at="2026-02-07T10:10:00+00:00",
            ),
        },
    )

    response = client.get("/api/v1/renders/history?limit=5&include_failed=true")
    assert response.status_code == 200
    items = response.json()["items"]
    assert [item["job_id"] for item in items] == ["job-failed", "job-completed"]


def test_render_history_fallback_album_art(monkeypatch) -> None:
    monkeypatch.setattr(
        queue_service,
        "jobs",
        {
            "job-completed": JobRecord(
                job_id="job-completed",
                status="completed",
                phase="done",
                progress=100,
                track={"track_id": "1", "title": "Song", "artist": "Artist"},
                result={"video_url": "/v.mp4", "thumbnail_url": "/t.jpg", "cache_key": "k"},
                error={"code": None, "message": None},
                cache_key="k",
                image_filename="album_hash.jpg",
                created_at="2026-02-07T09:00:00+00:00",
                updated_at="2026-02-07T09:10:00+00:00",
            ),
        },
    )

    response = client.get("/api/v1/renders/history?limit=5")
    assert response.status_code == 200
    item = response.json()["items"][0]
    assert item["track"]["album_art_url"] == "/static/inputs/album_hash.jpg"


def test_clear_render_history(monkeypatch) -> None:
    deleted_job_ids: list[str] = []

    def fake_delete_job(job_id: str) -> None:
        deleted_job_ids.append(job_id)

    monkeypatch.setattr(queue_service.storage, "delete_job", fake_delete_job)
    monkeypatch.setattr(
        queue_service,
        "jobs",
        {
            "job-completed": JobRecord(
                job_id="job-completed",
                status="completed",
                phase="done",
                progress=100,
                track={"track_id": "1", "title": "Song", "artist": "Artist"},
                result={"video_url": "/v.mp4", "thumbnail_url": "/t.jpg", "cache_key": "k"},
                error={"code": None, "message": None},
                cache_key="k",
                image_filename="a.jpg",
                created_at="2026-02-07T09:00:00+00:00",
                updated_at="2026-02-07T09:10:00+00:00",
            ),
            "job-failed": JobRecord(
                job_id="job-failed",
                status="failed",
                phase="error",
                progress=100,
                track={"track_id": "2", "title": "Fail", "artist": "Artist"},
                result={"video_url": None, "thumbnail_url": None, "cache_key": "kf"},
                error={"code": "ERR", "message": "x"},
                cache_key="kf",
                image_filename="b.jpg",
                created_at="2026-02-07T10:00:00+00:00",
                updated_at="2026-02-07T10:10:00+00:00",
            ),
            "job-queued": JobRecord(
                job_id="job-queued",
                status="queued",
                phase="queued",
                progress=0,
                track={"track_id": "3", "title": "Queued", "artist": "Artist"},
                result={"video_url": None, "thumbnail_url": None, "cache_key": "kq"},
                error={"code": None, "message": None},
                cache_key="kq",
                image_filename="c.jpg",
                created_at="2026-02-07T11:00:00+00:00",
                updated_at="2026-02-07T11:05:00+00:00",
            ),
        },
    )

    response = client.delete("/api/v1/renders/history")
    assert response.status_code == 200
    assert response.json()["deleted_count"] == 1
    assert deleted_job_ids == ["job-completed"]
    assert "job-queued" in queue_service.jobs


@pytest.mark.asyncio
async def test_sampling_progress_updates_job(monkeypatch) -> None:
    writes: list[str] = []

    def fake_write_job(job_id: str, _payload: dict) -> None:
        writes.append(job_id)

    monkeypatch.setattr(queue_service.storage, "write_job", fake_write_job)
    monkeypatch.setattr(
        queue_service,
        "jobs",
        {
            "job-sampling": JobRecord(
                job_id="job-sampling",
                status="processing",
                phase="sampling",
                progress=PHASE_PROGRESS["sampling"],
                track={"track_id": "1", "title": "Song", "artist": "Artist"},
                result={"video_url": None, "thumbnail_url": None, "cache_key": "k"},
                error={"code": None, "message": None},
                cache_key="k",
                image_filename="a.jpg",
                created_at="2026-02-07T10:00:00+00:00",
                updated_at="2026-02-07T10:00:00+00:00",
            )
        },
    )

    await queue_service._update_sampling_progress("job-sampling", 0.5)
    job = queue_service.jobs["job-sampling"]
    assert PHASE_PROGRESS["sampling"] < job.progress < PHASE_PROGRESS["assembling"]
    previous_progress = job.progress

    await queue_service._update_sampling_progress("job-sampling", 0.1)
    assert queue_service.jobs["job-sampling"].progress == previous_progress
    assert writes
