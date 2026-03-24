from __future__ import annotations


def test_camera_status_returns_json(client):
    resp = client.get("/camera_status")
    assert resp.status_code == 200
    payload = resp.get_json()
    assert isinstance(payload, dict)
    assert "running" in payload


def test_start_cameras_success(client, app_module, monkeypatch):
    class _DummyMgr:
        def __init__(self):
            self.is_running = False
            self.started = 0

        def start(self):
            self.started += 1
            self.is_running = True

    class _DummyScanner:
        def __init__(self):
            self._running = False
            self.started = 0

        def start(self):
            self.started += 1
            self._running = True

    mgr = _DummyMgr()
    scanner = _DummyScanner()
    monkeypatch.setattr(app_module, "camera_managers", [mgr])
    monkeypatch.setattr(app_module, "ai_scanners", [scanner])
    monkeypatch.setattr(
        app_module,
        "load_config",
        lambda: ([{"source_type": "usb", "camera_index": 0}], "normal", 0.05, False, "s3", None, 5),
    )
    monkeypatch.setattr(app_module, "build_managers_and_scanners", lambda *args, **kwargs: None)

    resp = client.post("/start_cameras")
    assert resp.status_code == 200
    payload = resp.get_json()
    assert payload["success"] is True
    assert mgr.started == 1
    assert scanner.started == 1


def test_start_cameras_error_returns_500(client, app_module, monkeypatch):
    monkeypatch.setattr(app_module, "load_config", lambda: (_ for _ in ()).throw(RuntimeError("boom")))
    resp = client.post("/start_cameras")
    assert resp.status_code == 500
    payload = resp.get_json()
    assert payload["success"] is False


def test_stop_cameras_success(client, app_module, monkeypatch):
    class _DummyMgr:
        def __init__(self):
            self.stopped = 0

        def stop(self):
            self.stopped += 1

    class _DummyScanner:
        def __init__(self):
            self.stopped = 0

        def stop(self):
            self.stopped += 1

    mgr = _DummyMgr()
    scanner = _DummyScanner()
    monkeypatch.setattr(app_module, "camera_managers", [mgr])
    monkeypatch.setattr(app_module, "ai_scanners", [scanner])

    resp = client.post("/stop_cameras")
    assert resp.status_code == 200
    payload = resp.get_json()
    assert payload["success"] is True
    assert mgr.stopped == 1
    assert scanner.stopped == 1


def test_video_feed_invalid_index_returns_404(client, app_module, monkeypatch):
    monkeypatch.setattr(app_module, "camera_managers", [])
    monkeypatch.setattr(app_module, "ai_scanners", [])
    resp = client.get("/video_feed/0")
    assert resp.status_code == 404
