from __future__ import annotations

import queue
import time


def test_stop_recording_requires_login(client):
    resp = client.post("/stop_recording")
    assert resp.status_code == 401


def test_stop_recording_when_not_recording_returns_ok(logged_in_client, app_module):
    with app_module.state_lock:
        app_module.app_state["is_recording"] = False

    resp = logged_in_client.post("/stop_recording")
    assert resp.status_code == 200
    payload = resp.get_json()
    assert payload["ok"] is True


def test_stop_recording_returns_400_when_packing_invalid(logged_in_client, app_module):
    with app_module.state_lock:
        app_module.app_state["is_recording"] = True
        app_module.app_state["recording_start"] = time.time() - 3
        app_module.app_state["recording_order_code"] = "ORDER-1"
        app_module.app_state["current_order_code"] = "ORDER-1"
        app_module.app_state["current_order_info"] = {
            "items": [{"name": "Item 1", "qty": 2}],
        }
        app_module.app_state["serial_state"] = {
            "__all__": {"required_qty": 2, "scanned_serials": {"SERIAL-1"}}
        }

    resp = logged_in_client.post("/stop_recording")
    assert resp.status_code == 400
    payload = resp.get_json()
    assert "packing_state" in payload
    assert payload["packing_state"]["has_missing"] is True


def test_stop_recording_success_resets_state_and_enqueues_upload(logged_in_client, app_module, monkeypatch, tmp_path):
    class DummyRecorder:
        def __init__(self, file_path: str):
            self.file_path = file_path

        def stop(self):
            return 7

    video_path = tmp_path / "video.mp4"
    video_path.write_bytes(b"video-bytes")

    monkeypatch.setattr(app_module, "recorder", DummyRecorder(str(video_path)))
    monkeypatch.setattr(app_module, "insert_video", lambda **kwargs: 123)
    monkeypatch.setattr(app_module.storage_service, "finish_recording_for_order", lambda *args, **kwargs: None)
    monkeypatch.setattr(app_module, "enforce_video_storage_limit", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(app_module, "ai_scanners", [])
    monkeypatch.setattr(app_module, "camera_managers", [])
    monkeypatch.setattr(app_module, "upload_queue", queue.Queue())
    monkeypatch.setattr(app_module, "upload_status_dict", {})

    with app_module.state_lock:
        app_module.app_state["is_recording"] = True
        app_module.app_state["recording_start"] = time.time() - 5
        app_module.app_state["recording_order_code"] = "ORDER-2"
        app_module.app_state["current_order_code"] = "ORDER-2"
        app_module.app_state["current_order_id"] = "id-2"
        app_module.app_state["order_queue"] = [
            {
                "id": "id-2",
                "order_code": "ORDER-2",
                "order_info": {"items": [{"qty": 1}]},
                "serial_state": {"__all__": {"required_qty": 1, "scanned_serials": {"S1"}}},
                "packing_evaluation": None,
                "created_at": time.time(),
            },
            {
                "id": "id-3",
                "order_code": "ORDER-3",
                "order_info": {"items": [{"qty": 1}]},
                "serial_state": {"__all__": {"required_qty": 1, "scanned_serials": set()}},
                "packing_evaluation": None,
                "created_at": time.time(),
            },
        ]
        app_module.app_state["current_order_info"] = {"items": [{"qty": 1}]}
        app_module.app_state["serial_state"] = {
            "__all__": {"required_qty": 1, "scanned_serials": {"S1"}}
        }

    resp = logged_in_client.post("/stop_recording")
    assert resp.status_code == 200
    payload = resp.get_json()
    assert payload["ok"] is True
    assert payload["duration"] == 7

    with app_module.state_lock:
        assert app_module.app_state["is_recording"] is False
        assert app_module.app_state["recording_order_code"] is None
        assert app_module.app_state["current_order_id"] == "id-3"

    assert app_module.upload_queue.qsize() == 1


def test_start_recording_requires_login(client):
    resp = client.post("/start_recording")
    assert resp.status_code == 401


def test_start_recording_requires_camera_running(logged_in_client, app_module):
    with app_module.camera_status_lock:
        app_module.camera_status["running"] = False
    resp = logged_in_client.post("/start_recording")
    assert resp.status_code == 400
    payload = resp.get_json()
    assert "Camera chưa khởi động" in payload["error"]


def test_start_recording_returns_already_recording(logged_in_client, app_module):
    with app_module.camera_status_lock:
        app_module.camera_status["running"] = True
    with app_module.state_lock:
        app_module.app_state["is_recording"] = True

    resp = logged_in_client.post("/start_recording")
    assert resp.status_code == 200
    payload = resp.get_json()
    assert payload["ok"] is True
    assert payload["message"] == "Đang quay"


def test_start_recording_success_uses_internal_start(logged_in_client, app_module, monkeypatch):
    with app_module.camera_status_lock:
        app_module.camera_status["running"] = True
    with app_module.state_lock:
        app_module.app_state["is_recording"] = False
        app_module.app_state["current_order_code"] = "ORDER-START-1"

    captured = {"code": None, "auto": None}

    def fake_start_internal(code, auto=False):
        captured["code"] = code
        captured["auto"] = auto
        return {"ok": True, "code": code}

    monkeypatch.setattr(app_module, "_start_recording_internal", fake_start_internal)
    resp = logged_in_client.post("/start_recording")

    assert resp.status_code == 200
    payload = resp.get_json()
    assert payload["ok"] is True
    assert captured["code"] == "ORDER-START-1"
    assert captured["auto"] is False


def test_reset_order_requires_login(client):
    resp = client.post("/reset_order")
    assert resp.status_code == 401


def test_reset_order_removes_current_and_advances(logged_in_client, app_module):
    class _DummyScanner:
        def __init__(self):
            self.called = 0

        def reset(self):
            self.called += 1

    scanner = _DummyScanner()
    app_module.ai_scanners = [scanner]

    with app_module.state_lock:
        app_module.app_state["order_queue"] = [
            {"id": "id-1", "order_code": "ORD-1"},
            {"id": "id-2", "order_code": "ORD-2"},
        ]
        app_module._queue_set_current("id-1")

    resp = logged_in_client.post("/reset_order")
    assert resp.status_code == 200
    payload = resp.get_json()
    assert payload["ok"] is True

    with app_module.state_lock:
        queue_ids = [e["id"] for e in app_module.app_state["order_queue"]]
        assert queue_ids == ["id-2"]
        assert app_module.app_state["current_order_id"] == "id-2"
    assert scanner.called == 1


def test_pause_recording_requires_login(client):
    resp = client.post("/pause_recording")
    assert resp.status_code == 401


def test_pause_recording_requires_active_recording(logged_in_client, app_module):
    with app_module.state_lock:
        app_module.app_state["is_recording"] = False
        app_module.app_state["is_paused"] = False
    resp = logged_in_client.post("/pause_recording")
    assert resp.status_code == 400


def test_pause_recording_already_paused(logged_in_client, app_module):
    with app_module.state_lock:
        app_module.app_state["is_recording"] = True
        app_module.app_state["is_paused"] = True
    resp = logged_in_client.post("/pause_recording")
    assert resp.status_code == 200
    payload = resp.get_json()
    assert payload["ok"] is True
    assert "tạm dừng" in payload["message"]


def test_pause_recording_success_calls_recorder(logged_in_client, app_module):
    class _DummyRecorder:
        def __init__(self):
            self.pause_called = 0

        def pause(self):
            self.pause_called += 1

    app_module.recorder = _DummyRecorder()
    with app_module.state_lock:
        app_module.app_state["is_recording"] = True
        app_module.app_state["is_paused"] = False

    resp = logged_in_client.post("/pause_recording")
    assert resp.status_code == 200
    payload = resp.get_json()
    assert payload["ok"] is True
    with app_module.state_lock:
        assert app_module.app_state["is_paused"] is True
    assert app_module.recorder.pause_called == 1


def test_resume_recording_requires_login(client):
    resp = client.post("/resume_recording")
    assert resp.status_code == 401


def test_resume_recording_requires_active_recording(logged_in_client, app_module):
    with app_module.state_lock:
        app_module.app_state["is_recording"] = False
        app_module.app_state["is_paused"] = False
    resp = logged_in_client.post("/resume_recording")
    assert resp.status_code == 400


def test_resume_recording_when_not_paused(logged_in_client, app_module):
    with app_module.state_lock:
        app_module.app_state["is_recording"] = True
        app_module.app_state["is_paused"] = False
    resp = logged_in_client.post("/resume_recording")
    assert resp.status_code == 200
    payload = resp.get_json()
    assert payload["ok"] is True
    assert "Đang ở trạng thái quay" in payload["message"]


def test_resume_recording_success_calls_recorder(logged_in_client, app_module):
    class _DummyRecorder:
        def __init__(self):
            self.resume_called = 0

        def resume(self):
            self.resume_called += 1

    app_module.recorder = _DummyRecorder()
    with app_module.state_lock:
        app_module.app_state["is_recording"] = True
        app_module.app_state["is_paused"] = True

    resp = logged_in_client.post("/resume_recording")
    assert resp.status_code == 200
    payload = resp.get_json()
    assert payload["ok"] is True
    with app_module.state_lock:
        assert app_module.app_state["is_paused"] is False
    assert app_module.recorder.resume_called == 1


def test_start_recording_internal_error_returns_500(logged_in_client, app_module, monkeypatch):
    with app_module.camera_status_lock:
        app_module.camera_status["running"] = True
    with app_module.state_lock:
        app_module.app_state["is_recording"] = False
        app_module.app_state["current_order_code"] = "ORD-ERR"

    monkeypatch.setattr(app_module, "_start_recording_internal", lambda *_args, **_kwargs: {"ok": False, "reason": "broken"})
    resp = logged_in_client.post("/start_recording")
    assert resp.status_code == 400
    payload = resp.get_json()
    assert "broken" in payload["error"]
