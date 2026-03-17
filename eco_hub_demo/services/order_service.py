"""
Thông tin đơn hàng (mock).
- Dữ liệu hiển thị: app_state["current_order_info"] (set trong app.py khi AI quét được mã).
- Nguồn: order_service.get_order(code) — mock; sau có thể thay bằng API EcoHub thật.
- UI: Dashboard cột phải, card "Thông tin đơn hàng (mock)", id="orderInfo"; cập nhật realtime qua /status + main.js.
"""

from __future__ import annotations

import os
from typing import Any


def get_order(code: str):
    """
    Trả về data đơn hàng theo mã code.
    - Nếu có cấu hình API qua env thì gọi API thật.
    - Nếu không có API thì trả mock data để demo.

    Kỳ vọng shape tối thiểu:
    {
      "order_id": "...",
      "platform": "...",
      "code": "...",
      "items": [{"name": "...", "qty": 1}, ...],
      "status": "ACTIVE" | "CANCELLED" | ...
    }
    """
    if not code:
        return None

    base_url = (os.environ.get("ECOHUB_ORDER_API_BASE_URL") or "").strip()
    token = (os.environ.get("ECOHUB_ORDER_API_TOKEN") or "").strip()
    url_template = (os.environ.get("ECOHUB_ORDER_API_URL_TEMPLATE") or "").strip()

    # Nếu có base_url => gọi API thật
    if base_url:
        try:
            import requests  # lazy import để không bắt buộc khi chạy mock
        except Exception as e:
            raise RuntimeError("Thiếu thư viện 'requests'. Hãy cài: pip install requests") from e

        if not url_template:
            # Default: GET {base}/orders/{code}
            url_template = base_url.rstrip("/") + "/orders/{code}"

        url = url_template.format(code=code, base=base_url.rstrip("/"))
        headers: dict[str, str] = {"Accept": "application/json"}
        if token:
            headers["Authorization"] = f"Bearer {token}"

        resp = requests.get(url, headers=headers, timeout=10)
        # 404 => coi như không tìm thấy
        if resp.status_code == 404:
            return None
        resp.raise_for_status()
        data: Any = resp.json()

        # Cho phép API trả {data: {...}} hoặc trả thẳng object
        if isinstance(data, dict) and "data" in data and isinstance(data.get("data"), dict):
            data = data["data"]

        # Chuẩn hóa field cơ bản để UI không vỡ
        if isinstance(data, dict):
            if "code" not in data:
                data["code"] = code
            if "order_id" not in data:
                data["order_id"] = data.get("id") or data.get("orderCode") or code
            if "items" not in data or not isinstance(data.get("items"), list):
                data["items"] = data.get("order_items") or []
            if "platform" not in data:
                data["platform"] = data.get("channel") or data.get("source") or "Unknown"
            if "status" not in data:
                data["status"] = data.get("state") or "ACTIVE"
            return data

        # Nếu API trả format lạ => trả None để app xử lý như không có
        return None

    # Fallback mock (khi không cấu hình API)
    # Cho phép điều khiển số lượng bằng cách nhét số vào code, ví dụ:
    # - TEST-VOICE-25  => tổng qty = 25
    # - QTY25          => tổng qty = 25
    # - ORDER_12       => tổng qty = 12
    import re

    qty = None
    m = re.search(r"(?:QTY|qty)[-_ ]?(\d{1,4})", code)
    if m:
        try:
            qty = int(m.group(1))
        except Exception:
            qty = None
    if qty is None:
        # lấy cụm số ở cuối chuỗi (nếu có)
        m2 = re.search(r"(\d{1,4})\s*$", code)
        if m2:
            try:
                qty = int(m2.group(1))
            except Exception:
                qty = None
    if qty is None:
        qty = 3
    if qty < 0:
        qty = 0
    if qty > 9999:
        qty = 9999

    return {
        "order_id": "SPX123456",
        "platform": "Shopee",
        "code": code,
        "status": "ACTIVE",
        "items": [
            {"name": "Sản phẩm (mock)", "qty": qty},
        ],
    }


def is_cancelled(order_info: dict | None) -> bool:
    if not isinstance(order_info, dict):
        return False
    st = (order_info.get("status") or "").strip().upper()
    return st in {"CANCELLED", "CANCELED", "CANCEL", "HUY", "HỦY", "HUỶ"}

