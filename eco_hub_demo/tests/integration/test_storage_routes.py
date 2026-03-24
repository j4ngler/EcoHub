from __future__ import annotations

import queue
from datetime import datetime, timezone


class _IdleRecorder:
    is_recording = False
    file_path = None


def test_upload_status_requires_login(client):
    resp = client.get("/upload-status")
    assert resp.status_code == 401


def test_upload_status_returns_queue_and_local_videos(logged_in_client, app_module, monkeypatch):
    task = app_module.UploadTask(
        filename="queued.mp4",
        path="x",
        order_code="ORD-1",
        status="pending",
        created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
    )
    monkeypatch.setattr(app_module, "_auto_queue_local_videos", lambda: None)
    monkeypatch.setattr(app_module, "upload_queue", queue.Queue())
    app_module.upload_queue.put(task)
    monkeypatch.setattr(app_module, "upload_status_dict", {"queued.mp4": task})
    monkeypatch.setattr(app_module.os.path, "exists", lambda p: False)

    resp = logged_in_client.get("/upload-status")
    assert resp.status_code == 200
    payload = resp.get_json()
    assert payload["success"] is True
    assert payload["queue_size"] == 1
    assert len(payload["local_videos"]) == 1
    assert payload["local_videos"][0]["filename"] == "queued.mp4"


def test_serve_video_returns_500_when_s3_not_configured(client, app_module, monkeypatch):
    monkeypatch.setattr(app_module.s3_service, "is_configured", lambda: False)
    resp = client.get("/videos/demo.mp4")
    assert resp.status_code == 500


def test_serve_video_redirects_to_presigned_url(client, app_module, monkeypatch):
    monkeypatch.setattr(app_module.s3_service, "is_configured", lambda: True)
    monkeypatch.setattr(
        app_module.s3_service, "generate_presigned_url", lambda _filename, expiration=3600: "https://example.local/file"
    )
    resp = client.get("/videos/demo.mp4")
    assert resp.status_code == 302
    assert resp.location == "https://example.local/file"


def test_serve_video_returns_500_when_url_generation_fails(client, app_module, monkeypatch):
    monkeypatch.setattr(app_module.s3_service, "is_configured", lambda: True)
    monkeypatch.setattr(app_module.s3_service, "generate_presigned_url", lambda _filename, expiration=3600: None)
    resp = client.get("/videos/demo.mp4")
    assert resp.status_code == 500


def test_storage_delete_requires_login(client):
    resp = client.post("/storage/delete/a.mp4")
    assert resp.status_code == 302
    assert resp.location in {"/", "http://localhost/"}


def test_storage_delete_when_s3_not_configured_redirects(logged_in_client, app_module, monkeypatch):
    monkeypatch.setattr(app_module, "recorder", _IdleRecorder())
    monkeypatch.setattr(app_module.s3_service, "is_configured", lambda: False)
    resp = logged_in_client.post("/storage/delete/a.mp4")
    assert resp.status_code == 302
    assert "/storage" in (resp.location or "")


def test_storage_delete_calls_s3_and_logs(logged_in_client, app_module, monkeypatch):
    called = {"delete": 0, "log": 0}
    monkeypatch.setattr(app_module, "recorder", _IdleRecorder())
    monkeypatch.setattr(app_module.s3_service, "is_configured", lambda: True)

    def fake_delete(_filename):
        called["delete"] += 1
        return True, "ok"

    monkeypatch.setattr(app_module.s3_service, "delete_video", fake_delete)
    monkeypatch.setattr(app_module, "log_video_deletion", lambda **kwargs: called.__setitem__("log", called["log"] + 1))

    resp = logged_in_client.post("/storage/delete/a.mp4")
    assert resp.status_code == 302
    assert "/storage" in (resp.location or "")
    assert called["delete"] == 1
    assert called["log"] == 1
