from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app, queue_service
from app.services_queue import JobRecord


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
