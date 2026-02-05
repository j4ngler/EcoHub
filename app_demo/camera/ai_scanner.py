import threading
import time
from typing import Callable, List, Dict, Any

import cv2
from pyzbar import pyzbar

# Mức độ nhạy: low = quét thưa, normal = mặc định, high = quét dày + tăng tương phản
SENSITIVITY_LOW = "low"
SENSITIVITY_NORMAL = "normal"
SENSITIVITY_HIGH = "high"


class AIBarcodeScanner:
    """
    Chạy thread riêng đọc frame từ CameraManager và dùng pyzbar để detect QR/barcode.
    - Độ nhạy: low / normal / high (tần suất quét + tiền xử lý ảnh).
    """

    def __init__(
        self,
        camera_manager,
        on_code_detected: Callable[[str], None],
        scan_interval_sec: float = 0.05,
        sensitivity: str = SENSITIVITY_NORMAL,
    ):
        self.camera_manager = camera_manager
        self.on_code_detected = on_code_detected
        self._scan_interval = max(0.02, min(0.2, scan_interval_sec))
        self._sensitivity = sensitivity if sensitivity in (SENSITIVITY_LOW, SENSITIVITY_NORMAL, SENSITIVITY_HIGH) else SENSITIVITY_NORMAL

        self._thread = None
        self._running = False
        self._paused = False  # Flag để tạm dừng quét (không stop thread)
        self._lock = threading.Lock()
        self._locked_code = None
        self._last_detections: List[Dict[str, Any]] = []

    def set_sensitivity(self, scan_interval_sec: float = None, sensitivity: str = None):
        """Cập nhật độ nhạy (có hiệu lực ngay trong vòng lặp)."""
        with self._lock:
            if scan_interval_sec is not None:
                self._scan_interval = max(0.02, min(0.2, scan_interval_sec))
            if sensitivity in (SENSITIVITY_LOW, SENSITIVITY_NORMAL, SENSITIVITY_HIGH):
                self._sensitivity = sensitivity

    def get_sensitivity(self) -> tuple:
        """Trả về (scan_interval_sec, sensitivity_level)."""
        with self._lock:
            return (self._scan_interval, self._sensitivity)

    def _preprocess(self, gray):
        """Tiền xử lý ảnh theo mức độ nhạy để dễ đọc mã mờ/nhỏ."""
        if self._sensitivity == SENSITIVITY_HIGH:
            # Tăng tương phản (CLAHE) giúp đọc mã trong điều kiện ánh sáng kém
            try:
                clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
                return clahe.apply(gray)
            except Exception:
                pass
        return gray

    def start(self):
        if self._running:
            return
        self._running = True

        def _loop():
            while self._running:
                try:
                    # Nếu bị pause, chờ và không quét
                    if self._paused:
                        time.sleep(0.1)
                        continue
                    
                    frame = self.camera_manager.get_frame()
                    if frame is None:
                        time.sleep(0.05)
                        continue
                    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
                    gray = self._preprocess(gray)
                    decoded = pyzbar.decode(gray)
                    detections = []
                    for obj in decoded:
                        x, y, w, h = obj.rect
                        code_data = obj.data.decode("utf-8", errors="ignore")
                        detections.append({"x": x, "y": y, "w": w, "h": h, "text": code_data})
                        with self._lock:
                            if self._locked_code is None:
                                self._locked_code = code_data
                                self.on_code_detected(code_data)
                    with self._lock:
                        self._last_detections = detections
                except Exception:
                    pass
                time.sleep(self._scan_interval)

        self._thread = threading.Thread(target=_loop, daemon=True)
        self._thread.start()

    def stop(self):
        self._running = False
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=1.0)

    def get_detections(self) -> List[Dict[str, Any]]:
        with self._lock:
            return list(self._last_detections)

    def pause(self):
        """Tạm dừng quét (không stop thread, chỉ skip quét frame)."""
        self._paused = True

    def resume(self):
        """Tiếp tục quét sau khi pause."""
        self._paused = False

    def reset(self):
        """Cho phép reset mã đã lock trong phiên hiện tại."""
        with self._lock:
            self._locked_code = None
            self._last_detections = []

