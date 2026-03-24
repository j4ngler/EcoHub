from __future__ import annotations

import sys
from types import SimpleNamespace


def test_storage_settings_requires_login(client):
    resp = client.get("/storage-settings")
    assert resp.status_code == 302
    assert resp.location in {"/", "http://localhost/"}


def test_storage_settings_post_validate_missing_fields(logged_in_client, app_module, monkeypatch):
    monkeypatch.setattr(app_module, "load_config", lambda: ([], "normal", 0.05, False, "s3", None, 5))
    monkeypatch.setattr(app_module, "save_config", lambda *args, **kwargs: None)

    resp = logged_in_client.post("/storage-settings", data={"s3_endpoint": "", "s3_access_key": ""})
    assert resp.status_code == 302
    assert "/storage-settings" in (resp.location or "")


def test_delete_s3_account_requires_login(client):
    resp = client.post("/delete-s3-account")
    assert resp.status_code == 401


def test_delete_s3_account_success(logged_in_client, app_module, monkeypatch):
    monkeypatch.setattr(app_module, "load_config", lambda: ([], "normal", 0.05, False, "s3", None, 5))
    monkeypatch.setattr(app_module, "save_config", lambda *args, **kwargs: None)
    app_module.s3_service.config = SimpleNamespace(bucket="b")

    resp = logged_in_client.post("/delete-s3-account")
    assert resp.status_code == 200
    payload = resp.get_json()
    assert payload["success"] is True
    assert app_module.s3_service.config is None


def test_test_s3_connection_requires_login(client):
    resp = client.post("/test-s3-connection")
    assert resp.status_code == 401


def test_test_s3_connection_success(logged_in_client, app_module, monkeypatch):
    class _FakeSvc:
        def __init__(self, _cfg):
            pass

        def test_connection(self):
            return True, "ok"

    monkeypatch.setattr(app_module, "S3Service", _FakeSvc)
    resp = logged_in_client.post(
        "/test-s3-connection",
        data={
            "s3_endpoint": "https://s3.example.com",
            "s3_access_key": "ak",
            "s3_secret_key": "sk",
            "s3_bucket": "b",
            "s3_region": "hn-2",
        },
    )
    assert resp.status_code == 200
    payload = resp.get_json()
    assert payload["success"] is True


def test_api_video_storage_usage_requires_login(client):
    resp = client.get("/api/video_storage_usage")
    assert resp.status_code == 401


def test_api_video_storage_usage_success(logged_in_client, app_module, monkeypatch):
    monkeypatch.setattr(app_module, "get_video_storage_usage", lambda shop_id=None: {"total_size_bytes": 123, "shop_id": shop_id})
    resp = logged_in_client.get("/api/video_storage_usage?shop_id=shop-1")
    assert resp.status_code == 200
    payload = resp.get_json()
    assert payload["success"] is True
    assert payload["usage"]["shop_id"] == "shop-1"


def test_api_video_storage_usage_error_returns_500(logged_in_client, app_module, monkeypatch):
    monkeypatch.setattr(app_module, "get_video_storage_usage", lambda shop_id=None: (_ for _ in ()).throw(RuntimeError("boom")))
    resp = logged_in_client.get("/api/video_storage_usage")
    assert resp.status_code == 500
    payload = resp.get_json()
    assert payload["success"] is False


def test_storage_page_redirects_to_settings_when_s3_missing(logged_in_client, app_module, monkeypatch):
    monkeypatch.setattr(app_module.s3_service, "is_configured", lambda: False)
    resp = logged_in_client.get("/storage")
    assert resp.status_code == 302
    assert "/storage-settings" in (resp.location or "")


def test_storage_page_success(logged_in_client, app_module, monkeypatch):
    class _Rec:
        is_recording = False
        file_path = None

    monkeypatch.setattr(app_module, "recorder", _Rec())
    monkeypatch.setattr(app_module.s3_service, "is_configured", lambda: True)
    monkeypatch.setattr(app_module, "_auto_queue_local_videos", lambda: None)
    monkeypatch.setattr(app_module.s3_service, "list_videos", lambda limit=1000: [])
    monkeypatch.setattr(app_module.s3_service, "get_total_size", lambda: 0)
    monkeypatch.setattr(app_module, "render_template", lambda *_args, **_kwargs: "ok")

    resp = logged_in_client.get("/storage")
    assert resp.status_code == 200
    assert resp.get_data(as_text=True) == "ok"


def test_test_camera_success_and_error(client, app_module, monkeypatch):
    class _CapOk:
        def isOpened(self):
            return True

        def read(self):
            return True, object()

        def release(self):
            return None

    class _CapFail:
        def isOpened(self):
            return False

        def read(self):
            return False, None

        def release(self):
            return None

    monkeypatch.setattr(app_module, "load_config", lambda: ([{"source_type": app_module.SOURCE_USB, "camera_index": 0}], None, None, None, None, None, None))
    monkeypatch.setitem(sys.modules, "cv2", SimpleNamespace(VideoCapture=lambda _idx: _CapOk()))
    resp_ok = client.post("/test_camera")
    assert resp_ok.status_code == 200
    assert resp_ok.get_json()["success"] is True

    monkeypatch.setitem(sys.modules, "cv2", SimpleNamespace(VideoCapture=lambda _idx: _CapFail()))
    resp_fail = client.post("/test_camera")
    assert resp_fail.status_code == 400
    assert resp_fail.get_json()["success"] is False


def test_camera_settings_requires_login(client):
    resp = client.get("/camera-settings")
    assert resp.status_code == 302
    assert resp.location in {"/", "http://localhost/"}


def test_camera_settings_get_success(logged_in_client, app_module, monkeypatch):
    monkeypatch.setattr(app_module, "scan_available_cameras", lambda: [0, 1])
    monkeypatch.setattr(app_module, "camera_configs", [{"source_type": app_module.SOURCE_USB, "camera_index": 0}])
    monkeypatch.setattr(app_module, "load_config", lambda: ([], "normal", 0.05, False, "s3", None, 5))
    monkeypatch.setattr(app_module, "ai_scanners", [])
    monkeypatch.setattr(app_module, "_primary_camera_manager", None)
    monkeypatch.setattr(app_module, "render_template", lambda *_args, **_kwargs: "ok-camera")

    resp = logged_in_client.get("/camera-settings")
    assert resp.status_code == 200
    assert resp.get_data(as_text=True) == "ok-camera"


def test_camera_settings_post_rejects_invalid_rtsp(logged_in_client, app_module):
    with app_module.state_lock:
        app_module.app_state["is_recording"] = False
    resp = logged_in_client.post(
        "/camera-settings",
        data={
            "enable_0": "1",
            "source_type_0": app_module.SOURCE_RTSP,
            "rtsp_url_0": "http://invalid",
        },
    )
    assert resp.status_code == 302
    assert "/camera-settings" in (resp.location or "")


def test_camera_settings_post_recording_state_short_circuit(logged_in_client, app_module):
    with app_module.state_lock:
        app_module.app_state["is_recording"] = True
    resp = logged_in_client.post("/camera-settings", data={})
    assert resp.status_code == 302
    assert "/camera-settings" in (resp.location or "")
    with app_module.state_lock:
        app_module.app_state["is_recording"] = False


def test_storage_settings_post_merge_existing_config(logged_in_client, app_module, monkeypatch):
    existing = app_module.S3Config(
        endpoint="https://old.example.com",
        access_key="old-ak",
        secret_key="old-sk",
        bucket="old-b",
        region="hn-2",
        prefix="old",
    )
    saved = {"called": 0}
    monkeypatch.setattr(app_module, "load_config", lambda: ([], "normal", 0.05, False, "s3", existing, 5))
    monkeypatch.setattr(app_module, "save_config", lambda *args, **kwargs: saved.__setitem__("called", saved["called"] + 1))

    resp = logged_in_client.post("/storage-settings", data={"s3_prefix": "new-prefix"})
    assert resp.status_code == 302
    assert "/storage-settings" in (resp.location or "")
    assert saved["called"] == 1
    assert app_module.s3_service.config.prefix == "new-prefix"


def test_storage_delete_redirects_when_recording_same_file(logged_in_client, app_module, monkeypatch):
    class _Rec:
        is_recording = True
        file_path = "a.mp4"

    monkeypatch.setattr(app_module, "recorder", _Rec())
    resp = logged_in_client.post("/storage/delete/a.mp4")
    assert resp.status_code == 302
    assert "/storage" in (resp.location or "")


def test_camera_settings_post_success_path(logged_in_client, app_module, monkeypatch):
    with app_module.state_lock:
        app_module.app_state["is_recording"] = False
    monkeypatch.setattr(app_module, "scan_available_cameras", lambda: [0, 1])

    called = {"build": 0, "save": 0}
    monkeypatch.setattr(
        app_module,
        "build_managers_and_scanners",
        lambda *args, **kwargs: called.__setitem__("build", called["build"] + 1),
    )
    monkeypatch.setattr(
        app_module,
        "save_config",
        lambda *args, **kwargs: called.__setitem__("save", called["save"] + 1),
    )

    resp = logged_in_client.post(
        "/camera-settings",
        data={
            "enable_0": "1",
            "source_type_0": app_module.SOURCE_USB,
            "camera_index_0": "0",
            "scan_sensitivity": app_module.SENSITIVITY_NORMAL,
            "qr_cooldown_seconds": "5",
            "auto_record_on_qr": "1",
        },
    )
    assert resp.status_code == 302
    assert "/camera-settings" in (resp.location or "")
    assert called["build"] == 1
    assert called["save"] == 1


def test_storage_delete_exception_from_s3_is_handled(logged_in_client, app_module, monkeypatch):
    class _Rec:
        is_recording = False
        file_path = None

    monkeypatch.setattr(app_module, "recorder", _Rec())
    monkeypatch.setattr(app_module.s3_service, "is_configured", lambda: True)
    monkeypatch.setattr(
        app_module.s3_service,
        "delete_video",
        lambda _filename: (_ for _ in ()).throw(RuntimeError("s3 error")),
    )

    resp = logged_in_client.post("/storage/delete/a.mp4")
    assert resp.status_code == 302
    assert "/storage" in (resp.location or "")


def test_login_post_sets_session_and_redirects(client):
    resp = client.post("/", data={"username": "alice"})
    assert resp.status_code == 302
    assert "/dashboard" in (resp.location or "")


def test_dashboard_orders_record_require_login(client):
    assert client.get("/dashboard").status_code == 302
    assert client.get("/orders").status_code == 302
    assert client.get("/record").status_code == 302


def test_dashboard_orders_record_success_render(logged_in_client, app_module, monkeypatch):
    monkeypatch.setattr(app_module, "render_template", lambda *_args, **_kwargs: "ok-page")
    assert logged_in_client.get("/dashboard").get_data(as_text=True) == "ok-page"
    assert logged_in_client.get("/orders").get_data(as_text=True) == "ok-page"
    assert logged_in_client.get("/record").get_data(as_text=True) == "ok-page"


def test_camera_settings_post_usb_index_invalid(logged_in_client, app_module, monkeypatch):
    with app_module.state_lock:
        app_module.app_state["is_recording"] = False
    monkeypatch.setattr(app_module, "scan_available_cameras", lambda: [0])
    resp = logged_in_client.post(
        "/camera-settings",
        data={
            "enable_0": "1",
            "source_type_0": app_module.SOURCE_USB,
            "camera_index_0": "99",
        },
    )
    assert resp.status_code == 302
    assert "/camera-settings" in (resp.location or "")


def test_camera_settings_post_runtime_error_is_handled(logged_in_client, app_module, monkeypatch):
    with app_module.state_lock:
        app_module.app_state["is_recording"] = False
    monkeypatch.setattr(app_module, "scan_available_cameras", lambda: [0, 1])
    monkeypatch.setattr(
        app_module,
        "build_managers_and_scanners",
        lambda *args, **kwargs: (_ for _ in ()).throw(RuntimeError("camera init fail")),
    )
    resp = logged_in_client.post(
        "/camera-settings",
        data={
            "enable_0": "1",
            "source_type_0": app_module.SOURCE_USB,
            "camera_index_0": "0",
        },
    )
    assert resp.status_code == 302
    assert "/camera-settings" in (resp.location or "")
