from __future__ import annotations

from app.storage import Storage


def test_cache_key_is_stable_for_same_inputs() -> None:
    data = b"same-image"
    k1 = Storage.compute_cache_key(data, "v1", "presetA")
    k2 = Storage.compute_cache_key(data, "v1", "presetA")
    assert k1 == k2


def test_cache_key_changes_with_workflow_version() -> None:
    data = b"same-image"
    k1 = Storage.compute_cache_key(data, "v1", "presetA")
    k2 = Storage.compute_cache_key(data, "v2", "presetA")
    assert k1 != k2


def test_cache_key_uses_album_identity_when_provided() -> None:
    k1 = Storage.compute_cache_key(b"img-a", "v1", "presetA", album_identity="album-123")
    k2 = Storage.compute_cache_key(b"img-b", "v1", "presetA", album_identity="album-123")
    assert k1 == k2


def test_cache_key_changes_when_album_identity_changes() -> None:
    k1 = Storage.compute_cache_key(b"img-a", "v1", "presetA", album_identity="album-123")
    k2 = Storage.compute_cache_key(b"img-a", "v1", "presetA", album_identity="album-999")
    assert k1 != k2
