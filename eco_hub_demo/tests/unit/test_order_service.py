from __future__ import annotations

import types
import builtins

import pytest

from services import order_service


def test_get_order_returns_none_when_code_empty():
    assert order_service.get_order("") is None
    assert order_service.get_order(None) is None


@pytest.mark.parametrize(
    ("code", "expected_qty"),
    [
        ("QTY25", 25),
        ("ORDER_12", 12),
        ("test-voice-7", 7),
        ("abc", 3),
    ],
)
def test_get_order_mock_mode_parses_qty(monkeypatch, code, expected_qty):
    monkeypatch.delenv("ECOHUB_ORDER_API_BASE_URL", raising=False)
    data = order_service.get_order(code)
    assert isinstance(data, dict)
    assert data["items"][0]["qty"] == expected_qty
    assert data["status"] == "ACTIVE"


def test_get_order_mock_mode_qty_token_uses_4_digits(monkeypatch):
    monkeypatch.delenv("ECOHUB_ORDER_API_BASE_URL", raising=False)
    data = order_service.get_order("QTY10000")
    # Regex hiện tại chỉ lấy tối đa 4 chữ số sau QTY.
    assert data["items"][0]["qty"] == 1000


def test_get_order_api_mode_404_returns_none(monkeypatch):
    class FakeResponse:
        status_code = 404

    def fake_get(*args, **kwargs):
        return FakeResponse()

    fake_requests = types.SimpleNamespace(get=fake_get)

    monkeypatch.setenv("ECOHUB_ORDER_API_BASE_URL", "https://api.example.com")
    monkeypatch.setattr(order_service, "requests", fake_requests, raising=False)
    monkeypatch.setitem(__import__("sys").modules, "requests", fake_requests)

    assert order_service.get_order("ABC123") is None


def test_get_order_api_mode_normalizes_payload(monkeypatch):
    class FakeResponse:
        status_code = 200

        def raise_for_status(self):
            return None

        def json(self):
            return {"data": {"id": "ID-1", "order_items": [{"name": "Item", "qty": 2}]}}

    def fake_get(*args, **kwargs):
        return FakeResponse()

    fake_requests = types.SimpleNamespace(get=fake_get)
    monkeypatch.setenv("ECOHUB_ORDER_API_BASE_URL", "https://api.example.com")
    monkeypatch.setitem(__import__("sys").modules, "requests", fake_requests)

    data = order_service.get_order("XYZ")
    assert data["code"] == "XYZ"
    assert data["order_id"] == "ID-1"
    assert data["items"] == [{"name": "Item", "qty": 2}]
    assert data["platform"] == "Unknown"
    assert data["status"] == "ACTIVE"


def test_get_order_api_mode_non_dict_payload_returns_none(monkeypatch):
    class FakeResponse:
        status_code = 200

        def raise_for_status(self):
            return None

        def json(self):
            return ["invalid"]

    def fake_get(*args, **kwargs):
        return FakeResponse()

    fake_requests = types.SimpleNamespace(get=fake_get)
    monkeypatch.setenv("ECOHUB_ORDER_API_BASE_URL", "https://api.example.com")
    monkeypatch.setitem(__import__("sys").modules, "requests", fake_requests)

    assert order_service.get_order("XYZ") is None


def test_get_order_api_mode_non_404_http_error_raises(monkeypatch):
    class FakeResponse:
        status_code = 500

        def raise_for_status(self):
            raise RuntimeError("http error")

        def json(self):
            return {}

    fake_requests = types.SimpleNamespace(get=lambda *args, **kwargs: FakeResponse())
    monkeypatch.setenv("ECOHUB_ORDER_API_BASE_URL", "https://api.example.com")
    monkeypatch.setitem(__import__("sys").modules, "requests", fake_requests)

    with pytest.raises(RuntimeError, match="http error"):
        order_service.get_order("XYZ")


def test_get_order_api_mode_timeout_error_raises(monkeypatch):
    def fake_get(*args, **kwargs):
        raise TimeoutError("timeout")

    fake_requests = types.SimpleNamespace(get=fake_get)
    monkeypatch.setenv("ECOHUB_ORDER_API_BASE_URL", "https://api.example.com")
    monkeypatch.setitem(__import__("sys").modules, "requests", fake_requests)

    with pytest.raises(TimeoutError, match="timeout"):
        order_service.get_order("XYZ")


def test_get_order_api_mode_missing_requests_raises_runtime_error(monkeypatch):
    orig_import = builtins.__import__

    def fake_import(name, *args, **kwargs):
        if name == "requests":
            raise ImportError("missing requests")
        return orig_import(name, *args, **kwargs)

    monkeypatch.setenv("ECOHUB_ORDER_API_BASE_URL", "https://api.example.com")
    monkeypatch.setattr(builtins, "__import__", fake_import)

    with pytest.raises(RuntimeError, match="Thiếu thư viện 'requests'"):
        order_service.get_order("XYZ")


@pytest.mark.parametrize(
    ("status", "expected"),
    [
        ("CANCELLED", True),
        ("canceled", True),
        ("HỦY", True),
        ("HUY", True),
        ("ACTIVE", False),
        ("", False),
    ],
)
def test_is_cancelled(status, expected):
    assert order_service.is_cancelled({"status": status}) is expected


def test_is_cancelled_with_non_dict_returns_false():
    assert order_service.is_cancelled(None) is False
    assert order_service.is_cancelled("CANCELLED") is False
