import time
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

    def write_frame(self, frame):
        """Ghi frame vào VideoWriter, tự động resize nếu cần."""
        if not self.is_recording or self._writer is None:
            return
        
        try:
            # Resize frame về target size nếu cần
            if self._target_size and frame.shape[:2][::-1] != self._target_size:
                frame = cv2.resize(frame, self._target_size)
            
            self._writer.write(frame)
        except Exception as e:
            print(f"[WARNING] Loi ghi frame (skip frame): {e}")
            # Không set is_recording = False, chỉ skip frame này và tiếp tục

    def stop(self) -> int:
        """
        Dừng quay và trả về thời lượng (giây).
        """
        if not self.is_recording:
            return 0

        duration = 0
        if self._start_time:
            duration = int(time.time() - self._start_time)

        self.is_recording = False
        
        if self._writer is not None:
            try:
                # Release VideoWriter an toàn
                self._writer.release()
            except Exception as e:
                print(f"[WARNING] Loi khi release VideoWriter: {e}")
            
            # Hiển thị thông tin video
            try:
                import os
                if os.path.exists(self._file_path):
                    size_mb = os.path.getsize(self._file_path) / (1024 * 1024)
                    print(f"Video da luu: {self._file_path} ({duration}s, {size_mb:.1f} MB)")
            except Exception:
                print(f"Video da luu: {self._file_path} ({duration}s)")

        self._writer = None
        self._start_time = None
        self._original_size = None
        self._target_size = None

        return duration

