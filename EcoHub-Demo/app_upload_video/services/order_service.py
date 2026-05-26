"""
Thông tin đơn hàng (mock).
- Dữ liệu hiển thị: app_state["current_order_info"] (set trong app.py khi AI quét được mã).
- Nguồn: order_service.get_order(code) — mock; sau có thể thay bằng API EcoHub thật.
- UI: Dashboard cột phải, card "Thông tin đơn hàng (mock)", id="orderInfo"; cập nhật realtime qua /status + main.js.
"""

CURRENT_ORDER_ID = "583627165888250890"
CURRENT_PRODUCT_ID = "1734485384694761005"
CURRENT_SKU_ID = "1734485387401856557"


def get_order(code: str):
    """
    Trả về mock data đơn hàng theo mã code.
    """
    if not code:
        return None

    return {
        "order_id": CURRENT_ORDER_ID,
        "platform": "TIKTOK_SHOP",
        "code": code,
        "product_id": CURRENT_PRODUCT_ID,
        "items": [
            {
                "name": "EcoVision Edge AI Box - ECVBOX01",
                "qty": 2,
                "product_id": CURRENT_PRODUCT_ID,
                "sku_id": CURRENT_SKU_ID,
            },
        ],
    }

