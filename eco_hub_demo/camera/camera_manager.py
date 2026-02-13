import threading
import time
import queue
from typing import Optional, List

import cv2
import platform


SOURCE_USB = "usb"
SOURCE_RTSP = "rtsp"


def scan_available_cameras(max_index: int = 6) -> List[int]:
    """
    Quét các camera USB index từ 0 đến max_index-1, trả về danh sách index mở được.
    """
    # Cache ngắn để tránh quét liên tục (giảm lag và giảm spam log OpenCV)
    global _scan_cache_ts, _scan_cache_available
    now = time.time()
    if _scan_cache_available is not None and (now - _scan_cache_ts) < 5.0:
        return list(_scan_cache_available)

    is_windows = platform.system().lower() == "windows"
    api_pref = cv2.CAP_DSHOW if is_windows else 0

    available = []
    for idx in range(max_index):
        # Trên Windows ưu tiên DirectShow để tránh một số warning "obsensor... index out of range"
        cap = cv2.VideoCapture(idx, api_pref) if api_pref else cv2.VideoCapture(idx)
        if cap is not None and cap.isOpened():
            available.append(idx)
            cap.release()
    _scan_cache_ts = now
    _scan_cache_available = list(available)
    return available


_scan_cache_ts = 0.0
_scan_cache_available: Optional[List[int]] = None


class CameraManager:
    """
    Quản lý luồng camera: USB webcam hoặc RTSP.
    - Chạy thread riêng đọc frame từ OpenCV (VideoCapture index hoặc URL).
    - Lưu frame mới nhất cho AI scan, MJPEG stream, recorder.
    """

    DEFAULT_WIDTH = 1280
    DEFAULT_HEIGHT = 720
    DEFAULT_FPS = 20.0

    def __init__(
        self,
        camera_index: int = 0,
        width: int = 1280,
        height: int = 720,
        fps: float = 20.0,
        source_type: str = SOURCE_USB,
        rtsp_url: str = "",
    ):
        self.source_type = source_type if source_type in (SOURCE_USB, SOURCE_RTSP) else SOURCE_USB
        self.camera_index = camera_index
        self.rtsp_url = (rtsp_url or "").strip()
        self.width = width
        self.height = height
        self.fps = max(5.0, min(30.0, float(fps)))

        self._cap: Optional[cv2.VideoCapture] = None
        self._thread: Optional[threading.Thread] = None
        self._running = False
        self._lock = threading.Lock()
        self._latest_frame = None  # Giữ lại cho compatibility
        self._recorder = None
        
        # OPTIMIZATION: Dùng Queue để đẩy frames từ camera thread sang AI thread
        # Maxsize = 2: chỉ giữ 2 frames mới nhất, bỏ frames cũ nếu consumer chậm
        self._frame_queue = queue.Queue(maxsize=2)

    @property
    def is_running(self) -> bool:
        return self._running

    def set_recorder(self, recorder):
        """Gắn recorder để mỗi frame đọc được sẽ được ghi nếu đang quay."""
        self._recorder = recorder

    def _open_capture(self) -> cv2.VideoCapture:
        """Mở VideoCapture theo source_type (USB index hoặc RTSP URL)."""
        if self.source_type == SOURCE_RTSP and self.rtsp_url:
            cap = cv2.VideoCapture(self.rtsp_url, cv2.CAP_FFMPEG)
            # RTSP: Giảm buffer xuống 0 để realtime (không delay)
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 0)
            # Tối ưu thêm cho RTSP
            cap.set(cv2.CAP_PROP_FPS, 25)  # Force 25 FPS
        else:
            is_windows = platform.system().lower() == "windows"
            cap = cv2.VideoCapture(self.camera_index, cv2.CAP_DSHOW) if is_windows else cv2.VideoCapture(self.camera_index)
            cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.width)
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.height)
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)  # USB buffer = 1
        return cap

    def start(self):
        if self._running:
            return

        self._cap = self._open_capture()

        if not self._cap.isOpened():
            raise RuntimeError(
                "Khong mo duoc camera (USB hoac RTSP). Kiem tra ket noi hoac URL."
            )

        # RTSP: lấy kích thước từ stream nếu set không được
        if self.source_type == SOURCE_RTSP:
            w = self._cap.get(cv2.CAP_PROP_FRAME_WIDTH)
            h = self._cap.get(cv2.CAP_PROP_FRAME_HEIGHT)
            if w and h:
                self.width = int(w)
                self.height = int(h)

        self._running = True
        # OPTIMIZATION: Giảm interval để đọc nhanh hơn (realtime)
        # Không sleep nhiều, để camera thread chạy liên tục
        interval = 0.01  # 10ms thay vì tính theo FPS

        def _loop():
            fail_count = 0  # Đếm số lần read fail liên tiếp
            max_fails = 30  # Sau 30 lần fail (khoảng 1.5-3 giây) → reconnect
            
            # DEBUG: Đếm frames để tính FPS
            frame_count = 0
            last_debug_time = time.time()
            
            while self._running:
                try:
                    # Kiểm tra connection
                    if self._cap is None or not self._cap.isOpened():
                        print(f"[AUTO-RECONNECT] Camera {self.source_type} bi disconnect, dang ket noi lai...")
                        if self._cap is not None:
                            try:
                                self._cap.release()
                            except Exception:
                                pass
                        
                        # Chờ 2 giây trước khi reconnect
                        time.sleep(2.0)
                        
                        if not self._running:  # Đã stop thì thoát
                            break
                        
                        # Mở lại connection
                        self._cap = self._open_capture()
                        
                        if self._cap.isOpened():
                            print(f"[AUTO-RECONNECT] Ket noi lai thanh cong!")
                            fail_count = 0
                            
                            # Cập nhật width/height cho RTSP
                            if self.source_type == SOURCE_RTSP:
                                w = self._cap.get(cv2.CAP_PROP_FRAME_WIDTH)
                                h = self._cap.get(cv2.CAP_PROP_FRAME_HEIGHT)
                                if w and h:
                                    self.width = int(w)
                                    self.height = int(h)
                        else:
                            print(f"[AUTO-RECONNECT] Ket noi lai that bai, thu lai sau 5s...")
                            time.sleep(5.0)
                            continue
                    
                    # Đọc frame
                    ret, frame = self._cap.read()
                    
                    if not ret:
                        fail_count += 1
                        
                        # Nếu fail quá nhiều lần → reconnect
                        if fail_count >= max_fails:
                            print(f"[AUTO-RECONNECT] Qua nhieu frame loi ({fail_count}), reconnect...")
                            fail_count = 0
                            if self._cap is not None:
                                try:
                                    self._cap.release()
                                except Exception:
                                    pass
                                self._cap = None
                            continue
                        
                        time.sleep(0.05)
                        continue
                    
                    # Frame OK → reset fail counter
                    fail_count = 0
                    frame_count += 1
                    
                    with self._lock:
                        self._latest_frame = frame
                    
                    # OPTIMIZATION: Đẩy frame vào queue cho AI thread
                    # Non-blocking: Nếu queue đầy, bỏ frame cũ và đẩy frame mới
                    queue_dropped = False
                    try:
                        # Nếu queue đầy, lấy frame cũ ra và bỏ
                        if self._frame_queue.full():
                            try:
                                self._frame_queue.get_nowait()
                                queue_dropped = True
                            except queue.Empty:
                                pass
                        self._frame_queue.put_nowait(frame.copy())  # Copy để tránh race condition
                    except queue.Full:
                        pass  # Bỏ qua nếu vẫn đầy
                    
                    # DEBUG: In ra FPS và queue status mỗi 5 giây
                    current_time = time.time()
                    if current_time - last_debug_time >= 5.0:
                        elapsed = current_time - last_debug_time
                        camera_fps = frame_count / elapsed
                        queue_size = self._frame_queue.qsize()
                        print(f"[CAMERA DEBUG] FPS: {camera_fps:.1f} | "
                              f"Queue: {queue_size}/2 | "
                              f"Dropped: {'YES' if queue_dropped else 'NO'} | "
                              f"Recording: {self._recorder.is_recording if self._recorder else False}")
                        frame_count = 0
                        last_debug_time = current_time
                    
                    if self._recorder is not None and self._recorder.is_recording:
                        self._recorder.write_frame(frame)
                        
                except Exception as e:
                    fail_count += 1
                    if fail_count >= max_fails:
                        print(f"[AUTO-RECONNECT] Exception: {e}, reconnect...")
                        fail_count = 0
                        if self._cap is not None:
                            try:
                                self._cap.release()
                            except Exception:
                                pass
                            self._cap = None
                    time.sleep(0.1)
                
                time.sleep(interval)

            # Cleanup khi dừng
            if self._cap is not None:
                try:
                    self._cap.release()
                except Exception:
                    pass
                self._cap = None

        self._thread = threading.Thread(target=_loop, daemon=True)
        self._thread.start()

    def stop(self):
        self._running = False
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=1.5)
        if self._cap is not None:
            try:
                self._cap.release()
            except Exception:
                pass
            self._cap = None
        with self._lock:
            self._latest_frame = None
        
        # Clear queue để tránh memory leak
        while not self._frame_queue.empty():
            try:
                self._frame_queue.get_nowait()
            except queue.Empty:
                break

    def update_stream_settings(
        self,
        source_type: Optional[str] = None,
        camera_index: Optional[int] = None,
        rtsp_url: Optional[str] = None,
        width: Optional[int] = None,
        height: Optional[int] = None,
        fps: Optional[float] = None,
    ) -> None:
        """
        Cập nhật nguồn (USB/RTSP) và tham số stream, rồi khởi động lại.
        """
        self.stop()

        if source_type in (SOURCE_USB, SOURCE_RTSP):
            self.source_type = source_type
        if camera_index is not None:
            self.camera_index = camera_index
        if rtsp_url is not None:
            self.rtsp_url = rtsp_url.strip()
        if width is not None and width >= 320:
            self.width = width
        if height is not None and height >= 240:
            self.height = height
        if fps is not None:
            self.fps = max(5.0, min(30.0, float(fps)))

        self.start()

    def get_frame(self):
        """
        Trả về bản copy frame mới nhất (BGR). Có thể trả về None nếu chưa có frame.
        Dùng cho MJPEG stream (cần frame realtime, không cần queue).
        """
        with self._lock:
            if self._latest_frame is None:
                return None
            return self._latest_frame.copy()
    
    def get_frame_from_queue(self, timeout: float = 0.1):
        """
        Lấy frame từ queue (dành cho AI thread).
        Non-blocking với timeout: trả về None nếu không có frame sau `timeout` giây.
        
        Args:
            timeout: Thời gian chờ tối đa (giây)
        Returns:
            Frame (numpy array) hoặc None
        """
        try:
            frame = self._frame_queue.get(timeout=timeout)
            return frame
        except queue.Empty:
            return None

