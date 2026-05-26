import os
import subprocess
import time
import unicodedata
from dataclasses import dataclass
from datetime import datetime
from typing import List, Tuple, Dict, Optional

# Trạng thái file local hiện tại không cảnh báo theo dung lượng tổng.
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

# Loại luồng quay: hàng gửi (outbound) / hàng hoàn (return)
RECORDING_FLOW_OUTBOUND = "outbound"
RECORDING_FLOW_RETURN = "return"
_RECORDING_FLOW_FOLDER = {
    RECORDING_FLOW_OUTBOUND: "hang_gui",
    RECORDING_FLOW_RETURN: "hang_hoan",
}


def normalize_recording_flow(value: str | None) -> str:
    raw = str(value or "").strip().lower()
    if raw in (RECORDING_FLOW_RETURN, "hang_hoan", "hoan", "return"):
        return RECORDING_FLOW_RETURN
    return RECORDING_FLOW_OUTBOUND


def recording_flow_folder_name(flow: str | None) -> str:
    return _RECORDING_FLOW_FOLDER.get(normalize_recording_flow(flow), "hang_gui")


def recording_flow_label(flow: str | None) -> str:
    if normalize_recording_flow(flow) == RECORDING_FLOW_RETURN:
        return "Hàng hoàn"
    return "Hàng gửi"


def _ensure_dir(path: str):
    os.makedirs(path, exist_ok=True)


def _sanitize_segment(value: str, fallback: str = "unknown") -> str:
    raw = str(value or "").strip()
    if not raw:
        return fallback
    normalized = unicodedata.normalize("NFKD", raw)
    ascii_only = "".join(ch for ch in normalized if ord(ch) < 128)
    cleaned = []
    for ch in ascii_only:
        if ch.isalnum() or ch in ("-", "_"):
            cleaned.append(ch)
        elif ch in (" ", "."):
            cleaned.append("_")
    result = "".join(cleaned).strip("._-")
    return result[:80] or fallback


def start_new_recording(
    videos_dir: str,
    order_code: str,
    employee_code: str = "",
    employee_name: str = "",
    work_session_label: str = "",
    recording_flow: str = RECORDING_FLOW_OUTBOUND,
) -> str:
    """
    Xác định đường dẫn file tạm để quay video mới cho 1 order.
    File sẽ được finalize / concat trong finish_recording_for_order.

    Cấu trúc thư mục:
      videos / {mã_nv} / {ca}_{ngày} / hang_gui|hang_hoan / {file}.mp4

    Lưu ý: Đường dẫn trả về có extension .mp4, nhưng recorder có thể thay đổi
    thành .avi nếu cần codec khác. Gọi update_recording_path() sau khi recorder start.
    """
    _ensure_dir(videos_dir)

    employee_folder = _sanitize_segment(employee_code, "unknown_employee")
    session_label = _sanitize_segment(work_session_label, "ca")
    flow_folder = recording_flow_folder_name(recording_flow)
    safe_employee_name = _sanitize_segment(employee_name, "unknown")
    safe_order_code = _sanitize_segment(order_code, "order")

    ts = time.strftime("%Y%m%d_%H%M%S", time.localtime())
    session_folder = f"{session_label}_{time.strftime('%Y%m%d', time.localtime())}"
    target_dir = os.path.join(videos_dir, employee_folder, session_folder, flow_folder)
    _ensure_dir(target_dir)
    filename = f"{safe_order_code}_{employee_folder}_{safe_employee_name}_{ts}.mp4"
    full_path = os.path.join(target_dir, filename)

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


def cancel_recording_for_order(order_code: str, file_path: str | None = None):
    """
    Hủy phiên quay hiện tại:
    - xóa file đang ghi nếu còn tồn tại
    - dọn index in-memory để lần quay sau bắt đầu sạch
    """
    info = _order_index.get(order_code) or {}
    target_path = file_path or info.get("temp_path") or info.get("base_path")

    if target_path and os.path.exists(target_path):
        try:
            os.remove(target_path)
        except Exception:
            pass

    if order_code in _order_index:
        temp_path = info.get("temp_path")
        base_path = info.get("base_path")
        if file_path and temp_path == file_path:
            info["temp_path"] = None
        if file_path and base_path == file_path:
            info["base_path"] = None
        if not file_path:
            info["temp_path"] = None
            info["base_path"] = None
        if not info.get("temp_path") and not info.get("base_path"):
            _order_index.pop(order_code, None)


def get_videos_info(videos_dir: str) -> Tuple[List[VideoInfo], int]:
    """
    Quét thư mục videos, trả về danh sách video + tổng dung lượng.
    Video được sắp xếp theo thời gian (MỚI NHẤT lên đầu).
    Tính trạng thái:
      - "An toàn"
      - "File cũ" (ngày tạo > MAX_VIDEO_AGE_DAYS - 2)
    """
    _ensure_dir(videos_dir)

    videos: List[VideoInfo] = []
    total_size = 0
    now = time.time()

    for root, _, files in os.walk(videos_dir):
        for name in files:
            if not (name.lower().endswith(".mp4") or name.lower().endswith(".avi")):
                continue
            path = os.path.join(root, name)
            if not os.path.isfile(path):
                continue

            size = os.path.getsize(path)
            total_size += size
            ctime = os.path.getctime(path)
            created_at = datetime.fromtimestamp(ctime)
            age_days = (now - ctime) / (24 * 3600)

            status = "An toàn"
            if age_days > MAX_VIDEO_AGE_DAYS - 2:
                status = "File cũ"

            rel_name = os.path.relpath(path, videos_dir).replace("\\", "/")
            videos.append(VideoInfo(name=rel_name, path=path, size_bytes=size, created_at=created_at, status=status))

    # Sắp xếp theo thời gian tạo (mới nhất lên đầu)
    videos.sort(key=lambda v: v.created_at, reverse=True)

    return videos, total_size


def get_storage_status(total_size: int, max_bytes: int) -> str:
    if max_bytes <= 0:
        return "Lưu thoải mái"
    if total_size > max_bytes:
        return "Đã vượt giới hạn"
    if total_size > max_bytes * 0.8:
        return "Sắp tràn dung lượng"
    return "An toàn"


def delete_video(videos_dir: str, filename: str):
    """
    Xóa video thủ công, cho phép đường dẫn tương đối dưới thư mục videos.
    Thử xóa nhiều lần nếu file đang được sử dụng.
    """
    normalized = os.path.normpath(str(filename or "").replace("/", os.sep).replace("\\", os.sep))
    if normalized.startswith("..") or os.path.isabs(normalized):
        raise ValueError("Tên file không hợp lệ")

    path = os.path.normpath(os.path.join(videos_dir, normalized))
    videos_root = os.path.normcase(os.path.normpath(videos_dir))
    if not os.path.normcase(path).startswith(videos_root):
        raise ValueError("Tên file không hợp lệ")
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

