import time
import threading
import queue
from typing import Optional, Tuple

import cv2


class VideoRecorder:
    """
    Recorder ghi video trực tiếp bằng OpenCV VideoWriter.
    - Ưu tiên codec mp4v (MP4) nếu có opencv-contrib-python
    - Fallback về MJPG (AVI) nếu mp4v không có
    - Tự động resize về resolution chuẩn nếu camera có resolution lạ (ví dụ 2304x1296)
    - Ghi trực tiếp, không cần lưu frame tạm
    """

    def __init__(self):
        self.is_recording: bool = False
        self._writer: Optional[cv2.VideoWriter] = None
        self._file_path: Optional[str] = None
        self._start_time: Optional[float] = None
        self._original_size: Optional[Tuple[int, int]] = None
        self._target_size: Optional[Tuple[int, int]] = None
        
        # ASYNC RECORDING: Queue và thread riêng
        self._frame_queue = queue.Queue(maxsize=90)  # Buffer 90 frames (~3s @ 30fps)
        self._writer_thread = None
        self._running = False

    @property
    def file_path(self) -> Optional[str]:
        return self._file_path

    def start(self, file_path: str, frame_size: Tuple[int, int], fps: float = 20.0):
        if self.is_recording:
            return

        w, h = frame_size
        if w < 64 or h < 64:
            raise RuntimeError(
                "Kich thuoc frame khong hop le (can width, height >= 64). "
                "Kiem tra camera/RTSP da cho frame chua."
            )

        # Resize về kích thước chuẩn nếu cần (OpenCV chỉ hỗ trợ resolution chuẩn)
        original_size = (w, h)
        standard_sizes = [
            (1920, 1080),  # Full HD
            (1280, 720),   # HD
            (640, 480),    # VGA
        ]
        
        # Tìm resolution chuẩn gần nhất (giữ aspect ratio tốt nhất)
        target_w, target_h = w, h
        aspect = w / h if h > 0 else 16/9
        
        # Nếu resolution không chuẩn, chọn resolution chuẩn gần nhất
        if (w, h) not in standard_sizes:
            for std_w, std_h in standard_sizes:
                if abs(std_w / std_h - aspect) < 0.1:  # aspect ratio tương tự
                    target_w, target_h = std_w, std_h
                    print(f"[INFO] Resize video tu {w}x{h} ve {target_w}x{target_h} (chuan)")
                    break
            else:
                # Fallback: chọn 1920x1080 nếu resolution > 1920, nếu không thì 1280x720
                target_w, target_h = (1920, 1080) if w > 1920 else (1280, 720)
                print(f"[INFO] Resize video tu {w}x{h} ve {target_w}x{target_h} (chuan)")

        # Thử codec theo thứ tự: mp4v (MP4 nhẹ) -> MJPG (AVI lớn)
        base_name = file_path.rsplit(".", 1)[0]
        codecs_to_try = [
            ('mp4v', base_name + '.mp4', 'MP4 (nhe, 2-5 MB/phut)'),
            ('MJPG', base_name + '.avi', 'AVI (lon, 50-200 MB/phut)'),
        ]
        
        writer = None
        final_path = file_path
        codec_desc = ""
        
        for codec_name, out_path, desc in codecs_to_try:
            try:
                fourcc = cv2.VideoWriter_fourcc(*codec_name)
                wtr = cv2.VideoWriter(out_path, fourcc, fps, (int(target_w), int(target_h)))
                
                if wtr and wtr.isOpened():
                    writer = wtr
                    final_path = out_path
                    codec_desc = desc
                    print(f"Video recording bat dau: {final_path}")
                    print(f"  -> Codec: {codec_desc}, Resolution: {target_w}x{target_h}")
                    break
                else:
                    if wtr:
                        wtr.release()
            except Exception:
                continue
        
        if writer is None:
            raise RuntimeError(
                "Khong khoi tao duoc VideoWriter voi bat ky codec nao (mp4v/MJPG). "
                "Giai phap:\n"
                "  pip uninstall opencv-python\n"
                "  pip install opencv-contrib-python"
            )

        self._writer = writer
        self._file_path = final_path
        self._original_size = original_size
        self._target_size = (target_w, target_h)
        self._start_time = time.time()
        self.is_recording = True
        
        # Start async writer thread
        self._running = True
        self._writer_thread = threading.Thread(target=self._write_loop, daemon=True)
        self._writer_thread.start()
        print(f"[RECORDER] Started ASYNC writer thread (buffer=90 frames)")

    def _write_loop(self):
        """
        ASYNC writer thread: Lấy frames từ queue và ghi vào VideoWriter.
        Chạy trong thread riêng, không block camera thread.
        """
        frames_written = 0
        frames_dropped = 0
        
        while self._running:
            try:
                # Lấy frame từ queue (timeout 0.5s)
                frame = self._frame_queue.get(timeout=0.5)
                
                if frame is None:  # Signal để stop
                    break
                
                # Resize frame về target size nếu cần
                if self._target_size and frame.shape[:2][::-1] != self._target_size:
                    frame = cv2.resize(frame, self._target_size)
                
                # Ghi frame vào VideoWriter
                if self._writer:
                    self._writer.write(frame)
                    frames_written += 1
                
            except queue.Empty:
                continue
            except Exception as e:
                frames_dropped += 1
                if frames_dropped % 10 == 0:
                    print(f"[RECORDER] Error writing frame (dropped {frames_dropped}): {e}")
        
        print(f"[RECORDER] Writer thread stopped. Written: {frames_written}, Dropped: {frames_dropped}")
    
    def write_frame(self, frame):
        """
        Đẩy frame vào queue (NON-BLOCKING).
        Camera thread không bị block, writer thread xử lý async.
        """
        if not self.is_recording:
            return
        
        try:
            # Non-blocking put: nếu queue đầy, bỏ frame cũ nhất
            if self._frame_queue.full():
                try:
                    self._frame_queue.get_nowait()  # Drop oldest frame
                except queue.Empty:
                    pass
            
            self._frame_queue.put_nowait(frame.copy())  # Copy để tránh race condition
        except queue.Full:
            pass  # Skip frame này nếu queue vẫn đầy

    def stop(self) -> int:
        """
        Dừng quay và trả về thời lượng (giây).
        Stop async writer thread và clear queue.
        """
        if not self.is_recording:
            return 0

        duration = 0
        if self._start_time:
            duration = int(time.time() - self._start_time)

        print(f"[RECORDER] Stopping... (duration={duration}s)")
        self.is_recording = False
        
        # Stop writer thread
        self._running = False
        
        # Signal writer thread to stop
        try:
            self._frame_queue.put(None, timeout=1)
        except:
            pass
        
        # Wait for writer thread to finish
        if self._writer_thread and self._writer_thread.is_alive():
            self._writer_thread.join(timeout=2.0)
            print(f"[RECORDER] Writer thread stopped")
        
        # Clear remaining frames in queue
        queue_size = self._frame_queue.qsize()
        while not self._frame_queue.empty():
            try:
                self._frame_queue.get_nowait()
            except:
                break
        if queue_size > 0:
            print(f"[RECORDER] Cleared {queue_size} frames from recorder queue")
        
        if self._writer is not None:
            try:
                # Release VideoWriter an toàn
                self._writer.release()
            except Exception as e:
                print(f"[WARNING] Error releasing VideoWriter: {e}")
            
            # Hiển thị thông tin video
            try:
                import os
                if os.path.exists(self._file_path):
                    size_mb = os.path.getsize(self._file_path) / (1024 * 1024)
                    print(f"[RECORDER] Video saved: {self._file_path} ({duration}s, {size_mb:.1f} MB)")
            except Exception:
                print(f"[RECORDER] Video saved: {self._file_path} ({duration}s)")

        self._writer = None
        self._start_time = None
        self._original_size = None
        self._target_size = None

        return duration

