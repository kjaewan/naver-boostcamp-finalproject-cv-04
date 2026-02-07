from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app, queue_service


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
