import queue
import threading
import time
from typing import Optional, Tuple

import cv2


class VideoRecorder:
    """
    Async recorder backed by OpenCV VideoWriter.
    - Prefer mp4v when available, then fall back to XVID/MJPG
    - Normalize unusual camera resolutions to common output sizes
    - Sample frames to the target FPS so playback stays realtime
    """

    def __init__(self):
        self.is_recording: bool = False
        self._writer: Optional[cv2.VideoWriter] = None
        self._writer_thread: Optional[threading.Thread] = None
        self._file_path: Optional[str] = None
        self._start_time: Optional[float] = None
        self._original_size: Optional[Tuple[int, int]] = None
        self._target_size: Optional[Tuple[int, int]] = None
        self._paused: bool = False
        self._running = False
        self._overlay_callback = None

        self._target_fps: float = 10.0
        self._frame_interval: float = 1.0 / 10.0
        self._next_frame_at: Optional[float] = None
        self._frames_skipped_sampling: int = 0

        # Keep the queue compact to avoid growing latency during encode spikes.
        self._frame_queue: queue.Queue = queue.Queue(maxsize=48)

    @property
    def file_path(self) -> Optional[str]:
        return self._file_path

    def set_overlay_callback(self, callback):
        self._overlay_callback = callback

    def start(self, file_path: str, frame_size: Tuple[int, int], fps: float = 10.0):
        if self.is_recording:
            return

        w, h = frame_size
        if w < 64 or h < 64:
            raise RuntimeError(
                "Kich thuoc frame khong hop le (can width, height >= 64). "
                "Kiem tra camera/RTSP da cho frame chua."
            )

        original_size = (w, h)
        standard_sizes = [
            (1920, 1080),
            (1280, 720),
            (640, 480),
        ]

        target_w, target_h = w, h
        aspect = w / h if h > 0 else 16 / 9
        if (w, h) not in standard_sizes:
            for std_w, std_h in standard_sizes:
                if abs(std_w / std_h - aspect) < 0.1:
                    target_w, target_h = std_w, std_h
                    print(f"[INFO] Resize video tu {w}x{h} ve {target_w}x{target_h} (chuan)")
                    break
            else:
                target_w, target_h = (1920, 1080) if w > 1920 else (1280, 720)
                print(f"[INFO] Resize video tu {w}x{h} ve {target_w}x{target_h} (chuan)")

        base_name = file_path.rsplit(".", 1)[0]
        codecs_to_try = [
            ("mp4v", base_name + ".mp4", "MP4 (nhe, 2-5 MB/phut)"),
            ("XVID", base_name + ".avi", "AVI XVID (nhanh, vua phai)"),
            ("MJPG", base_name + ".avi", "AVI MJPG (lon, 50-200 MB/phut)"),
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
        self._target_fps = max(1.0, float(fps))
        self._frame_interval = 1.0 / self._target_fps
        self._next_frame_at = None
        self._frames_skipped_sampling = 0
        self._paused = False
        self.is_recording = True
        self._running = True

        self._writer_thread = threading.Thread(target=self._write_loop, daemon=True)
        self._writer_thread.start()
        print(
            "[RECORDER] Started ASYNC writer thread "
            f"(buffer={self._frame_queue.maxsize} frames, target_fps={self._target_fps:.1f})"
        )

    def _write_loop(self):
        frames_written = 0
        frames_failed = 0

        while True:
            try:
                frame = self._frame_queue.get(timeout=0.5)
            except queue.Empty:
                if not self._running:
                    break
                continue

            if frame is None:
                break

            try:
                if self._target_size and frame.shape[:2][::-1] != self._target_size:
                    frame = cv2.resize(frame, self._target_size)

                if self._overlay_callback:
                    overlay_frame = self._overlay_callback(frame)
                    if overlay_frame is not None:
                        frame = overlay_frame

                if self._writer:
                    self._writer.write(frame)
                    frames_written += 1
            except Exception as e:
                frames_failed += 1
                if frames_failed % 10 == 0:
                    print(f"[RECORDER] Error writing frame (failed {frames_failed}): {e}")

        print(f"[RECORDER] Writer thread drained queue. Written: {frames_written}, Failed: {frames_failed}")

    def write_frame(self, frame):
        if not self.is_recording or self._paused:
            return

        now = time.perf_counter()
        if self._next_frame_at is None:
            self._next_frame_at = now + self._frame_interval
        elif now < self._next_frame_at:
            self._frames_skipped_sampling += 1
            return
        else:
            behind = now - self._next_frame_at
            skipped_slots = int(behind / self._frame_interval)
            self._next_frame_at += (skipped_slots + 1) * self._frame_interval
            if self._next_frame_at <= now:
                self._next_frame_at = now + self._frame_interval

        try:
            if self._frame_queue.full():
                try:
                    self._frame_queue.get_nowait()
                except queue.Empty:
                    pass
            self._frame_queue.put_nowait(frame)
        except queue.Full:
            pass

    def pause(self):
        if self.is_recording:
            self._paused = True

    def resume(self):
        if self.is_recording:
            self._paused = False

    def stop(self) -> int:
        if not self.is_recording:
            return 0

        duration = int(time.time() - self._start_time) if self._start_time else 0
        print(f"[RECORDER] Stopping... (duration={duration}s)")

        self.is_recording = False
        self._running = False

        try:
            self._frame_queue.put(None, timeout=1)
        except Exception:
            pass

        if self._writer_thread and self._writer_thread.is_alive():
            self._writer_thread.join(timeout=5.0)
            print("[RECORDER] Writer thread stopped")

        queue_size = self._frame_queue.qsize()
        while not self._frame_queue.empty():
            try:
                self._frame_queue.get_nowait()
            except queue.Empty:
                break
        if queue_size > 0:
            print(f"[RECORDER] Cleared {queue_size} frame(s) after stop")

        if self._writer is not None:
            try:
                self._writer.release()
            except Exception as e:
                print(f"[WARNING] Error releasing VideoWriter: {e}")

            try:
                import os

                if self._file_path and os.path.exists(self._file_path):
                    size_mb = os.path.getsize(self._file_path) / (1024 * 1024)
                    print(f"[RECORDER] Video saved: {self._file_path} ({duration}s, {size_mb:.1f} MB)")
            except Exception:
                print(f"[RECORDER] Video saved: {self._file_path} ({duration}s)")

        if self._frames_skipped_sampling:
            print(
                f"[RECORDER] Sampling skipped {self._frames_skipped_sampling} frame(s) "
                "to keep playback realtime"
            )

        self._writer = None
        self._writer_thread = None
        self._start_time = None
        self._original_size = None
        self._target_size = None
        self._next_frame_at = None
        self._frames_skipped_sampling = 0

        return duration
