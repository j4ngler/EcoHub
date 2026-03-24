from __future__ import annotations

import time


def _seed_order_queue(app_module):
    with app_module.state_lock:
        app_module.app_state["order_queue"] = [
            {
                "id": "id-1",
                "order_code": "ORDER-1",
                "order_info": {"order_id": "id-1", "items": [{"name": "A", "qty": 1}]},
                "serial_state": {"__all__": {"required_qty": 1, "scanned_serials": set()}},
                "packing_evaluation": None,
                "created_at": time.time(),
            },
            {
                "id": "id-2",
                "order_code": "ORDER-2",
                "order_info": {"order_id": "id-2", "items": [{"name": "B", "qty": 2}]},
                "serial_state": {"__all__": {"required_qty": 2, "scanned_serials": set()}},
                "packing_evaluation": None,
                "created_at": time.time(),
            },
        ]
        app_module._queue_set_current("id-1")


def test_manual_scan_requires_login(client):
    resp = client.post("/manual-scan", data={"code": "ABC"})
    assert resp.status_code == 302
    assert resp.location in {"/", "http://localhost/"}


def test_manual_scan_calls_on_code_detected(logged_in_client, app_module, monkeypatch):
    captured = {"code": None}

    def fake_on_code_detected(code: str):
        captured["code"] = code

    monkeypatch.setattr(app_module, "on_code_detected", fake_on_code_detected)

    resp = logged_in_client.post("/manual-scan", data={"code": "  ABC123  "})
    assert resp.status_code == 302
    assert "/dashboard" in (resp.location or "")
    assert captured["code"] == "ABC123"


def test_orders_select_sets_current_order(logged_in_client, app_module):
    _seed_order_queue(app_module)

    resp = logged_in_client.post("/orders/select", data={"order_id": "id-2"})
    assert resp.status_code == 302

    with app_module.state_lock:
        assert app_module.app_state["current_order_id"] == "id-2"
        assert app_module.app_state["current_order_code"] == "ORDER-2"


def test_orders_delete_current_advances_queue(logged_in_client, app_module):
    _seed_order_queue(app_module)

    resp = logged_in_client.post("/orders/delete", data={"order_id": "id-1"})
    assert resp.status_code == 302

    with app_module.state_lock:
        queue_ids = [item["id"] for item in app_module.app_state["order_queue"]]
        assert queue_ids == ["id-2"]
        assert app_module.app_state["current_order_id"] == "id-2"


def test_status_returns_data_and_clears_notifications(logged_in_client, app_module):
    with app_module.state_lock:
        app_module.app_state["is_recording"] = False
        app_module.app_state["recording_start"] = None
        app_module.app_state["current_order_code"] = "ORDER-9"
        app_module.app_state["current_order_info"] = {"items": [{"qty": 2}, {"qty": 1}]}
        app_module.app_state["serial_state"] = {"__all__": {"required_qty": 3, "scanned_serials": {"S1"}}}
        app_module.app_state["packing_evaluation"] = {"has_missing": True}
        app_module.app_state["notifications"] = [{"level": "info", "message": "msg", "ts": time.time()}]

    resp = logged_in_client.get("/status")
    assert resp.status_code == 200
    payload = resp.get_json()
    assert payload["current_order_code"] == "ORDER-9"
    assert payload["total_items"] == 3
    assert payload["notifications"]

    resp2 = logged_in_client.get("/status")
    payload2 = resp2.get_json()
    assert payload2["notifications"] == []


def test_manual_scan_api_requires_login(client):
    resp = client.post("/manual-scan-api", data={"code": "ABC"})
    assert resp.status_code == 401
    payload = resp.get_json()
    assert payload["ok"] is False


def test_manual_scan_api_invalid_code(logged_in_client):
    resp = logged_in_client.post("/manual-scan-api", data={"code": "   "})
    assert resp.status_code == 400
    payload = resp.get_json()
    assert payload["ok"] is False


def test_manual_scan_api_success(logged_in_client, app_module, monkeypatch):
    called = {"code": None}

    def fake_on_code_detected(code: str):
        called["code"] = code

    monkeypatch.setattr(app_module, "on_code_detected", fake_on_code_detected)
    resp = logged_in_client.post("/manual-scan-api", data={"code": "  A-1  "})

    assert resp.status_code == 200
    payload = resp.get_json()
    assert payload["ok"] is True
    assert payload["code"] == "A-1"
    assert called["code"] == "A-1"
