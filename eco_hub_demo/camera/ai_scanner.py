import threading
import time
from typing import Callable, List, Dict, Any

import cv2
import zxingcpp

# Mức độ nhạy: low = quét thưa, normal = mặc định, high = quét dày + tăng tương phản
SENSITIVITY_LOW = "low"
SENSITIVITY_NORMAL = "normal"
SENSITIVITY_HIGH = "high"


class AIBarcodeScanner:
    """
    Chạy thread riêng đọc frame từ CameraManager và dùng pyzbar để detect QR/barcode.
    - Độ nhạy: low / normal / high (tần suất quét + tiền xử lý ảnh).
    - Cooldown: Không quét lại cùng mã trong COOLDOWN_SECONDS giây.
    """
    
    DEFAULT_COOLDOWN_SECONDS = 5  # 5 giây cooldown cho mỗi mã

    def __init__(
        self,
        camera_manager,
        on_code_detected: Callable[[str], None],
        scan_interval_sec: float = 0.01,  # OPTIMIZATION: Giảm từ 0.05 → 0.01 (nhanh hơn)
        sensitivity: str = SENSITIVITY_NORMAL,
        cooldown_seconds: float = None,
    ):
        self.camera_manager = camera_manager
        self.on_code_detected = on_code_detected
        self._scan_interval = max(0.005, min(0.1, scan_interval_sec))  # OPTIMIZATION: Min 0.005s
        self._sensitivity = sensitivity if sensitivity in (SENSITIVITY_LOW, SENSITIVITY_NORMAL, SENSITIVITY_HIGH) else SENSITIVITY_NORMAL
        self._cooldown_seconds: float = max(0.0, float(cooldown_seconds)) if cooldown_seconds is not None else float(self.DEFAULT_COOLDOWN_SECONDS)

        self._thread = None
        self._running = False
        self._paused = False  # Flag để tạm dừng quét (không stop thread)
        self._lock = threading.Lock()
        self._locked_code = None
        self._last_detections: List[Dict[str, Any]] = []
        self._code_history: Dict[str, float] = {}  # {code: last_detected_timestamp}

    def set_sensitivity(self, scan_interval_sec: float = None, sensitivity: str = None):
        """Cập nhật độ nhạy (có hiệu lực ngay trong vòng lặp)."""
        with self._lock:
            if scan_interval_sec is not None:
                self._scan_interval = max(0.02, min(0.2, scan_interval_sec))
            if sensitivity in (SENSITIVITY_LOW, SENSITIVITY_NORMAL, SENSITIVITY_HIGH):
                self._sensitivity = sensitivity

    def set_cooldown(self, cooldown_seconds: float):
        """Cập nhật thời gian cooldown giữa 2 lần quét cùng một mã."""
        with self._lock:
            self._cooldown_seconds = max(0.0, float(cooldown_seconds))

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
            # OPTIMIZATION: Dùng timestamp thay vì sleep để kiểm soát 5 FPS
            # 5 FPS = 0.2 giây/frame
            TARGET_INTERVAL = 0.2  # 5 FPS
            last_scan_time = 0.0  # Thời điểm quét lần cuối
            
            # DEBUG: Đếm frames để debug timing
            scan_count = 0
            
            # MEMORY LEAK FIX: Cleanup code_history định kỳ
            last_cleanup_time = time.time()
            CLEANUP_INTERVAL = 60.0  # Cleanup mỗi 60 giây
            
            while self._running:
                try:
                    # DEBUG: Bắt đầu đo thời gian
                    t_start = time.time()
                    
                    # Nếu bị pause, không quét (nhưng vẫn lấy frame từ queue để tránh đầy)
                    if self._paused:
                        _ = self.camera_manager.get_frame_from_queue(timeout=0.1)
                        continue
                    
                    # OPTIMIZATION: Dùng Queue để lấy frame từ camera thread (tách biệt hoàn toàn)
                    # Timeout 0.01s: Giảm từ 0.05s để tăng tốc (10ms thay vì 50ms)
                    t_queue = time.time()
                    frame = self.camera_manager.get_frame_from_queue(timeout=0.01)
                    queue_time = (time.time() - t_queue) * 1000  # ms
                    
                    if frame is None:
                        continue  # Không có frame mới, tiếp tục vòng lặp
                    
                    # OPTIMIZATION 1: Kiểm soát 5 FPS bằng timestamp (KHÔNG dùng sleep)
                    current_time = time.time()
                    if current_time - last_scan_time < TARGET_INTERVAL:
                        continue  # Chưa đủ 0.2s, bỏ qua frame này
                    
                    last_scan_time = current_time  # Update timestamp
                    scan_count += 1
                    
                    # OPTIMIZATION 2: Giảm resolution trước khi quét (tăng tốc decode)
                    t_resize = time.time()
                    h, w = frame.shape[:2]
                    if w > 480:
                        # Resize xuống 480px width để quét cực nhanh
                        scale = 480.0 / w
                        frame = cv2.resize(frame, (480, int(h * scale)))
                    resize_time = (time.time() - t_resize) * 1000  # ms
                    
                    t_gray = time.time()
                    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
                    gray = self._preprocess(gray)
                    gray_time = (time.time() - t_gray) * 1000  # ms
                    
                    # ZXing-cpp: Nhanh hơn và chính xác hơn pyzbar
                    t_decode = time.time()
                    decoded = zxingcpp.read_barcodes(gray)
                    decode_time = (time.time() - t_decode) * 1000  # ms
                    
                    detections = []
                    current_time = time.time()
                    
                    for obj in decoded:
                        # ZXing-cpp trả về position với 4 điểm (top_left, top_right, bottom_right, bottom_left)
                        pos = obj.position
                        x = min(pos.top_left.x, pos.bottom_left.x)
                        y = min(pos.top_left.y, pos.top_right.y)
                        w = max(pos.top_right.x, pos.bottom_right.x) - x
                        h = max(pos.bottom_left.y, pos.bottom_right.y) - y
                        code_data = obj.text
                        detections.append({"x": int(x), "y": int(y), "w": int(w), "h": int(h), "text": code_data})
                        
                        with self._lock:
                            # Kiểm tra xem code này đã bị lock chưa
                            if self._locked_code is None:
                                # Kiểm tra cooldown: đã quét mã này trong vòng COOLDOWN_SECONDS giây chưa?
                                last_detected = self._code_history.get(code_data, 0)
                                if current_time - last_detected >= self._cooldown_seconds:
                                    # OK, có thể quét mã này
                                    self._locked_code = code_data
                                    self._code_history[code_data] = current_time
                                    self.on_code_detected(code_data)
                                else:
                                    # Mã này đã được quét gần đây, bỏ qua
                                    remaining = int(self._cooldown_seconds - (current_time - last_detected))
                                    print(f"[SCANNER COOLDOWN] QR code '{code_data}' scanned recently. "
                                          f"{remaining}s cooldown remaining.")
                    
                    with self._lock:
                        self._last_detections = detections
                    
                    # MEMORY LEAK FIX: Cleanup code_history định kỳ
                    current_time = time.time()
                    if current_time - last_cleanup_time >= CLEANUP_INTERVAL:
                        with self._lock:
                            # Xóa các entries cũ hơn COOLDOWN_SECONDS
                            codes_to_remove = [
                                code for code, timestamp in self._code_history.items()
                                if current_time - timestamp > self._cooldown_seconds
                            ]
                            for code in codes_to_remove:
                                del self._code_history[code]
                            
                            if codes_to_remove:
                                print(f"[MEMORY CLEANUP] Removed {len(codes_to_remove)} old QR codes from history. "
                                      f"Current size: {len(self._code_history)}")
                        
                        last_cleanup_time = current_time
                    
                    # DEBUG: In ra timing mỗi 10 frames hoặc khi có QR detected
                    total_time = (time.time() - t_start) * 1000  # ms
                    if len(detections) > 0 or scan_count % 10 == 0:
                        actual_fps = 1000.0 / total_time if total_time > 0 else 0
                        dict_size = len(self._code_history)
                        print(f"[AI DEBUG] Scan #{scan_count} | "
                              f"Queue: {queue_time:.1f}ms | "
                              f"Resize: {resize_time:.1f}ms | "
                              f"Gray: {gray_time:.1f}ms | "
                              f"Decode: {decode_time:.1f}ms | "
                              f"Total: {total_time:.1f}ms ({actual_fps:.1f} FPS) | "
                              f"QR: {len(detections)} | "
                              f"History: {dict_size}")
                    
                except Exception as e:
                    print(f"[AI DEBUG] Error: {e}")
                # OPTIMIZATION: KHÔNG dùng time.sleep(), chỉ dùng timestamp để kiểm soát FPS

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
        """
        Cho phép reset mã đã lock trong phiên hiện tại.
        Lưu ý: Mã vừa quét vẫn trong cooldown, không quét lại ngay.
        """
        with self._lock:
            self._locked_code = None
            self._last_detections = []
    
    def clear_cooldown(self, code: str = None):
        """
        Xóa cooldown cho một mã cụ thể hoặc tất cả mã.
        Dùng khi cần quét lại mã ngay lập tức.
        """
        with self._lock:
            if code:
                self._code_history.pop(code, None)
                print(f"[SCANNER] Cleared cooldown for code: {code}")
            else:
                self._code_history.clear()
                print("[SCANNER] Cleared all code cooldowns")

