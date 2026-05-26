"""Order service dùng TikTok client chung."""

from __future__ import annotations

import json
import os
from typing import Any

from services.tiktok_client import TikTokApiError, TikTokClient, _load_local_env_file
from services.tiktok_auth_store import list_authorizations

DEFAULT_TIKTOK_ORDER_PATH = "/api/order/202309/orders/query"


def get_order_platform() -> str:
    """
    tiktok: gọi TikTok Shop API qua get_order().
    generic: Shopee/Lazada/khác — chưa có API: chỉ dùng mã quét + lưu video, không gọi TikTok.
    Giá trị env ECOHUB_ORDER_PLATFORM: tiktok | generic | shopee | lazada | other | manual
    """
    _load_local_env_file()
    p = (os.environ.get("ECOHUB_ORDER_PLATFORM") or "tiktok").strip().lower()
    if p in ("shopee", "lazada", "generic", "other", "manual", "khac", "k"):
        return "generic"
    return "tiktok"


def build_local_order(code: str) -> dict:
    """
    Đơn nội bộ khi không kết nối API (Shopee/Lazada/...).
    items rỗng => không bắt buộc quét serial khi stop_recording.
    """
    _load_local_env_file()
    label = (os.environ.get("ECOHUB_GENERIC_ORDER_PLATFORM") or "SHOPEE_OTHER").strip() or "SHOPEE_OTHER"
    return {
        "code": code,
        "order_id": code,
        "platform": label,
        "status": "ACTIVE",
        "shipping_status": "",
        "product_id": None,
        "sku_id": None,
        "items": [],
    }


def _normalize_item(raw_item: Any) -> dict:
    if not isinstance(raw_item, dict):
        return {}
    qty = raw_item.get("quantity") or raw_item.get("qty") or raw_item.get("count") or 1
    try:
        qty = int(qty)
    except Exception:
        qty = 1
    return {
        "name": raw_item.get("product_name")
        or raw_item.get("name")
        or raw_item.get("title")
        or "Unknown item",
        "qty": max(1, qty),
        "product_id": raw_item.get("product_id") or raw_item.get("productId"),
        "sku_id": raw_item.get("sku_id") or raw_item.get("skuId"),
    }


def _normalize_order_payload(order_raw: dict, code: str) -> dict:
    items_raw = (
        order_raw.get("line_items")
        or order_raw.get("line_item_list")
        or order_raw.get("order_line_list")
        or order_raw.get("items")
        or order_raw.get("order_items")
        or []
    )
    if not isinstance(items_raw, list):
        items_raw = []
    items = [it for it in (_normalize_item(x) for x in items_raw) if it]

    product_id = order_raw.get("product_id") or order_raw.get("productId")
    sku_id = order_raw.get("sku_id") or order_raw.get("skuId")
    if not product_id and items:
        product_id = items[0].get("product_id")
    if not sku_id and items:
        sku_id = items[0].get("sku_id")

    shipping_status = (
        order_raw.get("shipping_status")
        or order_raw.get("order_status")
        or order_raw.get("status")
        or order_raw.get("fulfillment_status")
        or order_raw.get("delivery_status")
        or order_raw.get("logistics_status")
        or ""
    )
    shipping_status = str(shipping_status).strip().upper() if shipping_status else ""
    return {
        "code": code,
        "order_id": order_raw.get("order_id") or order_raw.get("id") or code,
        "platform": "TIKTOK_SHOP",
        "status": "ACTIVE",
        "shipping_status": shipping_status,
        "product_id": product_id,
        "sku_id": sku_id,
        "items": items,
    }


def _merge_shop_metadata(order_info: dict, auth_record: dict[str, str]) -> dict:
    if not isinstance(order_info, dict):
        return order_info
    if auth_record.get("shop_id"):
        order_info["shop_id"] = auth_record["shop_id"]
    if auth_record.get("shop_cipher"):
        order_info["shop_cipher"] = auth_record["shop_cipher"]
    if auth_record.get("merchant_id"):
        order_info["merchant_id"] = auth_record["merchant_id"]
    if auth_record.get("id") is not None:
        order_info["tiktok_auth_id"] = auth_record["id"]
    return order_info


def _build_order_client_candidates() -> list[dict[str, str]]:
    _load_local_env_file()
    db_path = os.environ.get("ECOHUB_TIKTOK_AUTH_DB") or os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "tiktok_auth.db",
    )
    auth_records = []
    try:
        auth_records = list_authorizations(db_path)
    except Exception:
        auth_records = []
    out: list[dict[str, str]] = []
    for record in auth_records:
        access_token = (record.access_token or "").strip()
        shop_cipher = (record.shop_cipher or "").strip()
        if not access_token or not shop_cipher:
            continue
        out.append(
            {
                "id": int(record.id),
                "access_token": access_token,
                "shop_cipher": shop_cipher,
                "shop_id": (record.shop_id or "").strip(),
                "merchant_id": (record.merchant_id or "").strip(),
            }
        )
    return out


def _resolve_order_with_client(client: TikTokClient, code: str) -> dict | None:
    endpoint_path = (os.environ.get("ECOHUB_ORDER_API_ENDPOINT_PATH") or DEFAULT_TIKTOK_ORDER_PATH).strip()
    lookup_field = (os.environ.get("ECOHUB_ORDER_API_LOOKUP_FIELD") or "").strip()
    method = (os.environ.get("ECOHUB_ORDER_API_METHOD") or "POST").strip().upper()
    query_params = _parse_json_object_env("ECOHUB_ORDER_API_QUERY_PARAMS")
    body_template = _parse_json_object_env("ECOHUB_ORDER_API_BODY_TEMPLATE")

    payload = dict(body_template)
    lookup_value: Any = None
    if lookup_field:
        if lookup_field.endswith("_list"):
            lookup_value = [str(code)]
        else:
            lookup_value = str(code)
        payload[lookup_field] = lookup_value

    req_query = dict(query_params)
    req_body = payload if method != "GET" else None
    if method == "GET" and lookup_field:
        req_query[lookup_field] = lookup_value

    root: Any = client.request(
        method=method,
        path=endpoint_path,
        query_params=req_query,
        body=req_body,
    )

    if not isinstance(root, dict):
        return None

    api_code = root.get("code")
    if api_code not in (0, "0", None):
        msg = root.get("message") or root.get("msg") or "TikTok API trả lỗi"
        raise RuntimeError(f"TikTok API error code={api_code}: {msg}")

    data = root.get("data") or {}
    order_raw: dict[str, Any] | None = None
    if isinstance(data, dict):
        if isinstance(data.get("order"), dict):
            order_raw = data.get("order")
        elif isinstance(data.get("orders"), list) and data.get("orders"):
            rows = [x for x in data["orders"] if isinstance(x, dict)]
            for row in rows:
                row_id = str(row.get("id") or row.get("order_id") or "")
                row_tracking = str(row.get("tracking_number") or "")
                if row_id == str(code) or row_tracking == str(code):
                    order_raw = row
                    break
            if not order_raw and rows:
                order_raw = rows[0]
        elif isinstance(data.get("order_list"), list) and data.get("order_list"):
            rows = [x for x in data["order_list"] if isinstance(x, dict)]
            for row in rows:
                row_id = str(row.get("id") or row.get("order_id") or "")
                row_tracking = str(row.get("tracking_number") or "")
                if row_id == str(code) or row_tracking == str(code):
                    order_raw = row
                    break
            if not order_raw and rows:
                order_raw = rows[0]

    if not order_raw:
        return None

    return _normalize_order_payload(order_raw, code)


def _parse_json_object_env(env_name: str) -> dict[str, Any]:
    raw = (os.environ.get(env_name) or "").strip()
    if not raw:
        return {}
    try:
        value = json.loads(raw)
    except Exception as e:
        raise RuntimeError(f"{env_name} phải là JSON object hợp lệ") from e
    if not isinstance(value, dict):
        raise RuntimeError(f"{env_name} phải là JSON object hợp lệ")
    return value


def get_order(code: str):
    """Lấy thông tin đơn từ TikTok API theo field lookup cấu hình trong env."""
    if not code:
        return None
    _load_local_env_file()
    # Tìm đơn theo credential shop cụ thể, ưu tiên các shop đã ủy quyền trong DB.
    candidates = _build_order_client_candidates()
    for record in candidates:
        try:
            client = TikTokClient.from_tokens(
                access_token=record["access_token"],
                shop_cipher=record["shop_cipher"],
            )
        except RuntimeError as e:
            print(f"[ORDER API] Bỏ qua record auth không hợp lệ: {e}")
            continue
        try:
            order_info = _resolve_order_with_client(client, code)
        except TikTokApiError as e:
            print(f"[ORDER API] HTTP error shop_cipher={record.get('shop_cipher')}: {e}")
            continue
        except RuntimeError as e:
            print(f"[ORDER API] API error shop_cipher={record.get('shop_cipher')}: {e}")
            continue
        if order_info:
            return _merge_shop_metadata(order_info, record)

    # Fallback nếu không có shop record hợp lệ hoặc đơn không nằm trong các shop đã lưu.
    try:
        client = TikTokClient.from_env()
        order_info = _resolve_order_with_client(client, code)
    except TikTokApiError as e:
        print(f"[ORDER API] HTTP error code={code}: {e}")
        raise RuntimeError(f"TikTok API HTTP lỗi: {e}") from e
    except RuntimeError as e:
        print(f"[ORDER API] Runtime error code={code}: {e}")
        raise
    if not order_info:
        return None
    return order_info


def is_cancelled(order_info: dict | None) -> bool:
    if not isinstance(order_info, dict):
        return False
    st = (order_info.get("status") or "").strip().upper()
    return st in {"CANCELLED", "CANCELED", "CANCEL", "HUY", "HỦY", "HUỶ"}

