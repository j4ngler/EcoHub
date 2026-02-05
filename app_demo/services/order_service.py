"""
Thông tin đơn hàng (mock).
- Dữ liệu hiển thị: app_state["current_order_info"] (set trong app.py khi AI quét được mã).
- Nguồn: order_service.get_order(code) — mock; sau có thể thay bằng API EcoHub thật.
- UI: Dashboard cột phải, card "Thông tin đơn hàng (mock)", id="orderInfo"; cập nhật realtime qua /status + main.js.
"""


def get_order(code: str):
    """
    Trả về mock data đơn hàng theo mã code.
    """
    if not code:
        return None

    return {
        "order_id": "SPX123456",
        "platform": "Shopee",
        "code": code,
        "items": [
            {"name": "Áo thun", "qty": 2},
            {"name": "Quần jean", "qty": 1},
        ],
    }

