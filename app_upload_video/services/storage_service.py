import os
import subprocess
import time
from dataclasses import dataclass
from datetime import datetime
from typing import List, Tuple, Dict, Optional

# Giới hạn demo
MAX_TOTAL_BYTES = 1 * 1024 * 1024 * 1024  # 1GB
MAX_VIDEO_DURATION_SECONDS = 20 * 60  # 20 phút
MAX_VIDEO_AGE_DAYS = 20
RESUME_WINDOW_MINUTES = 10


@dataclass
class VideoInfo:
    name: str
    path: str
    size_bytes: int
    created_at: datetime
    status: str


_order_index: Dict[str, Dict[str, Optional[float]]] = {}


def _ensure_dir(path: str):
    os.makedirs(path, exist_ok=True)


def start_new_recording(videos_dir: str, order_code: str) -> str:
    """
    Xác định đường dẫn file tạm để quay video mới cho 1 order.
    File sẽ được finalize / concat trong finish_recording_for_order.
    
    Lưu ý: Đường dẫn trả về có extension .mp4, nhưng recorder có thể thay đổi 
    thành .avi nếu cần codec khác. Gọi update_recording_path() sau khi recorder start.
    """
    _ensure_dir(videos_dir)
    
    # Sanitize order_code: loại bỏ ký tự đặc biệt không hợp lệ cho tên file Windows
    import re
    safe_order_code = re.sub(r'[<>:"/\\|?*]', '_', order_code)  # Thay ký tự đặc biệt bằng _
    safe_order_code = safe_order_code[:50]  # Giới hạn độ dài tên file
    
    ts = time.strftime("%Y%m%d_%H%M%S", time.localtime())
    filename = f"{safe_order_code}_{ts}.mp4"
    full_path = os.path.join(videos_dir, filename)

    # Lưu vào index in-memory cho phiên hiện tại
    _order_index.setdefault(order_code, {})
    _order_index[order_code]["temp_path"] = full_path
    _order_index[order_code]["last_record_start"] = time.time()

    return full_path


def update_recording_path(order_code: str, actual_path: str):
    """
    Cập nhật đường dẫn thực tế của file đang ghi (nếu recorder đổi extension).
    Gọi sau khi recorder.start() nếu recorder.file_path khác với path ban đầu.
    """
    if order_code in _order_index:
        _order_index[order_code]["temp_path"] = actual_path


def _should_resume_with(base_path: str) -> bool:
    """
    Quyết định có nên append vào video cũ không, dựa trên:
    - Thời gian sửa đổi gần nhất < RESUME_WINDOW_MINUTES
    """
    if not base_path or not os.path.exists(base_path):
        return False
    mtime = os.path.getmtime(base_path)
    return (time.time() - mtime) <= RESUME_WINDOW_MINUTES * 60


def finish_recording_for_order(order_code: str, duration_seconds: int):
    """
    Hoàn tất 1 lần quay cho order_code:
    - Nếu đã có video cũ và còn trong cửa sổ resume => dùng FFmpeg concat để append.
    - Ngược lại => coi như video mới độc lập.
    """
    info = _order_index.get(order_code) or {}
    temp_path = info.get("temp_path")
    if not temp_path or not os.path.exists(temp_path):
        return

    base_path = info.get("base_path")

    # Nếu chưa có base_path hoặc base_path không còn trong cửa sổ resume -> coi temp là base mới
    if not base_path or not _should_resume_with(base_path):
        _order_index[order_code]["base_path"] = temp_path
        _order_index[order_code]["last_record_end"] = time.time()
        return

    # Có base_path và còn trong thời gian cho phép => concat bằng FFmpeg
    concat_list_path = os.path.join(os.path.dirname(base_path), f"{order_code}_concat.txt")
    output_path = os.path.join(os.path.dirname(base_path), f"{order_code}_merged_{int(time.time())}.mp4")

    with open(concat_list_path, "w", encoding="utf-8") as f:
        f.write(f"file '{os.path.abspath(base_path)}'\n")
        f.write(f"file '{os.path.abspath(temp_path)}'\n")

    cmd = [
        "ffmpeg",
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        concat_list_path,
        "-c",
        "copy",
        output_path,
    ]

    try:
        subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        # Thay base_path bằng file mới
        os.replace(output_path, base_path)
        os.remove(temp_path)
    except Exception:
        # Nếu concat lỗi, vẫn giữ file temp như file độc lập
        _order_index[order_code]["base_path"] = temp_path
    finally:
        if os.path.exists(concat_list_path):
            os.remove(concat_list_path)

    _order_index[order_code]["last_record_end"] = time.time()


def get_videos_info(videos_dir: str) -> Tuple[List[VideoInfo], int]:
    """
    Quét thư mục videos, trả về danh sách video + tổng dung lượng.
    Video được sắp xếp theo thời gian (MỚI NHẤT lên đầu).
    Tính trạng thái:
      - "An toàn"
      - "Sắp tràn dung lượng" (dung lượng > 80% MAX_TOTAL_BYTES)
      - "Sắp hết hạn" (ngày tạo > MAX_VIDEO_AGE_DAYS - 2)
    """
    _ensure_dir(videos_dir)

    videos: List[VideoInfo] = []
    total_size = 0
    now = time.time()

    for name in os.listdir(videos_dir):
        # Hỗ trợ cả .mp4 và .avi
        if not (name.lower().endswith(".mp4") or name.lower().endswith(".avi")):
            continue
        path = os.path.join(videos_dir, name)
        if not os.path.isfile(path):
            continue

        size = os.path.getsize(path)
        total_size += size
        ctime = os.path.getctime(path)
        created_at = datetime.fromtimestamp(ctime)
        age_days = (now - ctime) / (24 * 3600)

        status = "An toàn"
        if total_size > MAX_TOTAL_BYTES * 0.8:
            status = "Sắp tràn dung lượng"
        if age_days > MAX_VIDEO_AGE_DAYS - 2:
            status = "Sắp hết hạn"

        videos.append(VideoInfo(name=name, path=path, size_bytes=size, created_at=created_at, status=status))

    # Sắp xếp theo thời gian tạo (mới nhất lên đầu)
    videos.sort(key=lambda v: v.created_at, reverse=True)

    return videos, total_size


def get_storage_status(total_size: int, max_bytes: int) -> str:
    if total_size > max_bytes:
        return "Đã vượt giới hạn"
    if total_size > max_bytes * 0.8:
        return "Sắp tràn dung lượng"
    return "An toàn"


def delete_video(videos_dir: str, filename: str):
    """
    Xóa video thủ công, chống path traversal.
    Thử xóa nhiều lần nếu file đang được sử dụng.
    """
    if "/" in filename or "\\" in filename:
        raise ValueError("Tên file không hợp lệ")
    
    path = os.path.join(videos_dir, filename)
    if not os.path.isfile(path):
        raise FileNotFoundError(f"File không tồn tại: {filename}")
    
    # Thử xóa file với retry (file có thể đang được serve)
    max_retries = 3
    for attempt in range(max_retries):
        try:
            os.remove(path)
            return  # Xóa thành công
        except PermissionError:
            if attempt < max_retries - 1:
                time.sleep(0.5)  # Đợi 500ms rồi thử lại
            else:
                raise PermissionError(
                    f"Không thể xóa video '{filename}'. "
                    "File đang được sử dụng. Vui lòng đóng video và thử lại."
                )

