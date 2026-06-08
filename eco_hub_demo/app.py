import os
import subprocess
import threading
import time
import json
import sys
import secrets
import re
import smtplib
import cv2
from email.mime.text import MIMEText
from email.utils import formataddr
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired
from urllib.parse import urlencode, urljoin
from datetime import datetime, timedelta, timezone
from typing import Any

# Fix UTF-8 encoding cho Windows console
if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except:
        pass

# Tắt warning OpenCV không cần thiết (ví dụ: DSHOW camera not found)
os.environ["OPENCV_LOG_LEVEL"] = "ERROR"  # Chỉ hiện lỗi nghiêm trọng, ẩn warning


def _local_env_file_candidates() -> list[str]:
    """
    - PyInstaller (frozen): chỉ đọc .env cạnh file .exe (thuận tiện triển khai cho khách).
    - Dev: .env cạnh app.py.
    """
    if getattr(sys, "frozen", False):
        exe_dir = os.path.dirname(os.path.abspath(sys.executable))
        return [os.path.join(exe_dir, ".env")]
    proj_dir = os.path.dirname(os.path.abspath(__file__))
    return [os.path.join(proj_dir, ".env")]


def _load_local_env_file() -> None:
    """
    Nạp biến môi trường từ file .env (nếu có) cho môi trường local.
    Không ghi đè biến đã tồn tại trong OS env.
    """
    try:
        env_path = ""
        for candidate in _local_env_file_candidates():
            if os.path.isfile(candidate):
                env_path = candidate
                break
        if not env_path:
            return
        print(f"[ENV] Đã nạp .env: {env_path}")
        with open(env_path, "r", encoding="utf-8") as f:
            for raw_line in f:
                line = (raw_line or "").strip()
                if not line or line.startswith("#"):
                    continue
                if "=" not in line:
                    continue
                key, value = line.split("=", 1)
                key = key.strip()
                value = value.strip()
                if (value.startswith('"') and value.endswith('"')) or (
                    value.startswith("'") and value.endswith("'")
                ):
                    value = value[1:-1]
                if key:
                    # Ưu tiên cấu hình .env cho toàn bộ biến ECOHUB_* để tránh kẹt giá trị cũ trong process env.
                    if key.startswith("ECOHUB_"):
                        os.environ[key] = value
                    elif key not in os.environ:
                        os.environ[key] = value
    except Exception as e:
        print(f"[ENV] Không đọc được .env: {e}")


_load_local_env_file()

_single_instance_mutex_handle = None
_shutdown_in_progress = False


def _read_http_bind_from_env() -> tuple[str, int]:
    host = (os.environ.get("ECOHUB_HTTP_HOST") or "127.0.0.1").strip() or "127.0.0.1"
    try:
        port = int((os.environ.get("ECOHUB_HTTP_PORT") or "5000").strip() or "5000")
    except ValueError:
        port = 5000
    return host, port


def _runtime_dir() -> str:
    if getattr(sys, "frozen", False):
        return os.path.dirname(os.path.abspath(sys.executable))
    return os.path.dirname(os.path.abspath(__file__))


def _single_instance_enabled() -> bool:
    raw = (os.environ.get("ECOHUB_SINGLE_INSTANCE") or "").strip().lower()
    if raw in ("0", "false", "no", "off"):
        return False
    if raw in ("1", "true", "yes", "on"):
        return True
    return bool(getattr(sys, "frozen", False))


def _open_existing_instance_browser(host: str, port: int) -> None:
    try:
        import webbrowser

        webbrowser.open(f"http://{host}:{port}/")
    except Exception as e:
        print(f"[SINGLE INSTANCE] Khong mo duoc trinh duyet cho phien dang chay: {e}")


def _ensure_single_instance_or_exit() -> None:
    global _single_instance_mutex_handle

    if not _single_instance_enabled() or sys.platform != "win32":
        return

    try:
        import ctypes

        host, port = _read_http_bind_from_env()
        mutex_name = f"Local\\EcoHub_{host.replace('.', '_').replace(':', '_')}_{port}"
        kernel32 = ctypes.windll.kernel32
        handle = kernel32.CreateMutexW(None, False, mutex_name)
        if not handle:
            return
        _single_instance_mutex_handle = handle
        if kernel32.GetLastError() == 183:
            print("[SINGLE INSTANCE] Phat hien EcoHub da dang chay, mo lai phien cu.")
            _open_existing_instance_browser(host, port)
            raise SystemExit(0)
    except SystemExit:
        raise
    except Exception as e:
        print(f"[SINGLE INSTANCE] Khong the kiem tra single-instance: {e}")


_ensure_single_instance_or_exit()

from flask import (
    Flask,
    render_template,
    request,
    redirect,
    url_for,
    session,
    jsonify,
    flash,
    send_from_directory,
)

from camera.camera_manager import CameraManager, scan_available_cameras, SOURCE_USB, SOURCE_RTSP
from camera.ai_scanner import (
    AIBarcodeScanner,
    SENSITIVITY_LOW,
    SENSITIVITY_NORMAL,
    SENSITIVITY_HIGH,
)
from camera.recorder import VideoRecorder
from services import order_service, storage_service
from services.s3_service import S3Service, S3Config
from services.config_encryption import get_encryptor
from services.video_metadata import (
    insert_video,
    mark_uploaded,
    list_active_videos_for_shop,
    mark_deleted,
    log_video_deletion,
)
from services.tiktok_auth_store import (
    init_db as init_tiktok_auth_db,
    insert_authorization as insert_tiktok_authorization,
    list_authorizations as list_tiktok_authorizations,
)
from services.user_auth_store import (
    init_db as init_user_auth_db,
    create_user as create_auth_user,
    get_user_by_username,
    get_user_by_contact,
    update_user_password,
    count_users as count_auth_users,
)
from services.tiktok_client import TikTokClient, TikTokApiError
from werkzeug.security import check_password_hash


# ==========================
# CẤU HÌNH ỨNG DỤNG
# ==========================

# Xử lý path cho PyInstaller
def get_base_path():
    """Get base path - works for both dev and PyInstaller"""
    if getattr(sys, 'frozen', False):
        # Running in PyInstaller bundle
        return sys._MEIPASS
    else:
        # Running in normal Python
        return os.path.dirname(os.path.abspath(__file__))

BASE_DIR = get_base_path()
LOCAL_STORAGE_MODE = "local"


def _read_app_version() -> str:
    version_file = os.path.join(BASE_DIR, "VERSION")
    try:
        if os.path.isfile(version_file):
            with open(version_file, "r", encoding="utf-8") as f:
                value = (f.read() or "").strip()
            if value:
                return value
    except Exception as e:
        print(f"[UPDATE] Khong doc duoc VERSION: {e}")
    return "0.0.0"


APP_VERSION = _read_app_version()


def _resolve_app_data_dir() -> str:
    """
    Thư mục ghi dữ liệu runtime (config, DB, video, log).

    - Dev: thư mục chứa app.py.
    - PyInstaller (frozen): mặc định thư mục "data" cạnh EcoHub.exe (portable; copy cả thư mục app là mang theo dữ liệu).
    - Ghi đè: biến môi trường ECOHUB_DATA_DIR (đường dẫn tuyệt đối, hoặc tương đối so với thư mục exe).
    """
    if not getattr(sys, "frozen", False):
        return os.path.dirname(os.path.abspath(__file__))
    exe_dir = os.path.dirname(os.path.abspath(sys.executable))
    raw = (os.environ.get("ECOHUB_DATA_DIR") or "").strip().strip('"')
    if not raw:
        return os.path.join(exe_dir, "data")
    expanded = os.path.expandvars(os.path.expanduser(raw))
    if os.path.isabs(expanded):
        return os.path.normpath(expanded)
    return os.path.normpath(os.path.join(exe_dir, expanded))


# Data directory cho config và videos (writable)
DATA_DIR = _resolve_app_data_dir()

VIDEOS_DIR = os.path.join(DATA_DIR, "videos")
CONFIG_FILE = os.path.join(DATA_DIR, "config.json")
CONFIG_KEY_FILE = os.path.join(DATA_DIR, "config.key")
VIDEO_METADATA_DB = os.path.join(DATA_DIR, "video_metadata.db")
TIKTOK_AUTH_DB = os.path.join(DATA_DIR, "tiktok_auth.db")
USER_AUTH_DB = os.path.join(DATA_DIR, "user_auth.db")
LOGS_DIR = os.path.join(DATA_DIR, "logs")
UPDATES_DIR = os.path.join(DATA_DIR, "updates")
APP_LOG_FILE = os.path.join(LOGS_DIR, "app.log")
UPDATE_STATE_FILE = os.path.join(UPDATES_DIR, "pending_update.json")
os.environ["ECOHUB_TIKTOK_AUTH_DB"] = TIKTOK_AUTH_DB
os.makedirs(VIDEOS_DIR, exist_ok=True)
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(LOGS_DIR, exist_ok=True)
os.makedirs(UPDATES_DIR, exist_ok=True)
init_tiktok_auth_db(TIKTOK_AUTH_DB)
init_user_auth_db(USER_AUTH_DB)


def _runtime_updater_script_path() -> str:
    runtime_path = os.path.join(_runtime_dir(), "updater.ps1")
    if os.path.isfile(runtime_path):
        return runtime_path
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), "updater.ps1")


def _parse_version_parts(raw: str) -> tuple[int, ...]:
    raw = (raw or "").strip()
    if not raw:
        return (0,)
    parts: list[int] = []
    for item in re.split(r"[^\d]+", raw):
        if not item:
            continue
        try:
            parts.append(int(item))
        except ValueError:
            parts.append(0)
    return tuple(parts or [0])


def _is_remote_version_newer(remote_version: str, current_version: str) -> bool:
    return _parse_version_parts(remote_version) > _parse_version_parts(current_version)


def _read_pending_update_state() -> dict[str, Any]:
    if not os.path.isfile(UPDATE_STATE_FILE):
        return {}
    try:
        with open(UPDATE_STATE_FILE, "r", encoding="utf-8-sig") as f:
            data = json.load(f) or {}
        if not isinstance(data, dict):
            return {}
        return data
    except Exception as e:
        print(f"[UPDATE] Khong doc duoc pending update state: {e}")
        return {}


def _write_pending_update_state(data: dict[str, Any]) -> None:
    with open(UPDATE_STATE_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def _clear_pending_update_state() -> None:
    try:
        if os.path.isfile(UPDATE_STATE_FILE):
            os.remove(UPDATE_STATE_FILE)
    except Exception as e:
        print(f"[UPDATE] Khong xoa duoc pending update state: {e}")


def _cleanup_stale_pending_update_state() -> None:
    pending = _read_pending_update_state()
    zip_path = str(pending.get("zip_path") or "").strip()
    version = str(pending.get("version") or "").strip()
    if not zip_path or not version:
        if pending:
            _clear_pending_update_state()
        return
    if not os.path.isfile(zip_path) or not _is_remote_version_newer(version, APP_VERSION):
        _clear_pending_update_state()


def _update_manifest_url() -> str:
    return (os.environ.get("ECOHUB_UPDATE_MANIFEST_URL") or "").strip()


def _update_enabled() -> bool:
    return bool(getattr(sys, "frozen", False) and _update_manifest_url())


def _normalize_update_manifest(payload: Any, source_url: str) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise ValueError("Manifest update phai la JSON object.")
    version = str(payload.get("version") or "").strip()
    download_url = str(payload.get("url") or "").strip()
    if not version:
        raise ValueError("Manifest update thieu field 'version'.")
    if not download_url:
        raise ValueError("Manifest update thieu field 'url'.")
    return {
        "version": version,
        "url": urljoin(source_url, download_url),
        "notes": str(payload.get("notes") or "").strip(),
        "published_at": str(payload.get("published_at") or "").strip(),
    }


def _fetch_update_manifest(timeout_sec: int = 10) -> dict[str, Any]:
    manifest_url = _update_manifest_url()
    if not manifest_url:
        raise RuntimeError("Chua cau hinh ECOHUB_UPDATE_MANIFEST_URL trong .env")
    import requests

    resp = requests.get(manifest_url, timeout=timeout_sec)
    resp.raise_for_status()
    return _normalize_update_manifest(resp.json(), manifest_url)


def _build_update_status() -> dict[str, Any]:
    pending = _read_pending_update_state()
    result: dict[str, Any] = {
        "enabled": _update_enabled(),
        "current_version": APP_VERSION,
        "manifest_url": _update_manifest_url(),
        "update_available": False,
        "downloaded": False,
        "pending_version": str(pending.get("version") or "").strip(),
    }
    if not result["enabled"]:
        result["message"] = "Auto-update chi ho tro khi chay ban EcoHub.exe va co ECOHUB_UPDATE_MANIFEST_URL."
        return result

    manifest = _fetch_update_manifest()
    result["remote_version"] = manifest["version"]
    result["download_url"] = manifest["url"]
    result["notes"] = manifest["notes"]
    result["published_at"] = manifest["published_at"]
    result["update_available"] = _is_remote_version_newer(manifest["version"], APP_VERSION)
    result["downloaded"] = (
        bool(pending.get("zip_path"))
        and os.path.isfile(str(pending.get("zip_path")))
        and str(pending.get("version") or "").strip() == manifest["version"]
    )
    if result["downloaded"]:
        result["pending_zip_path"] = str(pending.get("zip_path") or "")
    return result


def _download_update_package(manifest: dict[str, Any]) -> dict[str, Any]:
    import requests

    version = str(manifest.get("version") or "").strip() or "unknown"
    target_name = f"EcoHub-portable-{version}.zip"
    final_path = os.path.join(UPDATES_DIR, target_name)
    temp_path = final_path + ".download"

    if os.path.isfile(temp_path):
        os.remove(temp_path)

    with requests.get(manifest["url"], timeout=30, stream=True) as resp:
        resp.raise_for_status()
        with open(temp_path, "wb") as f:
            for chunk in resp.iter_content(chunk_size=1024 * 512):
                if chunk:
                    f.write(chunk)

    if os.path.isfile(final_path):
        os.remove(final_path)
    os.replace(temp_path, final_path)

    pending = {
        "version": version,
        "zip_path": final_path,
        "download_url": manifest["url"],
        "downloaded_at": datetime.now(timezone.utc).isoformat(),
    }
    _write_pending_update_state(pending)
    return pending


def _launch_windows_updater(zip_path: str) -> None:
    script_path = _runtime_updater_script_path()
    if sys.platform != "win32":
        raise RuntimeError("Updater hien chi ho tro Windows.")
    if not os.path.isfile(script_path):
        raise RuntimeError(f"Khong tim thay updater script: {script_path}")
    if not getattr(sys, "frozen", False):
        raise RuntimeError("Updater chi duoc phep ap dung tren ban EcoHub.exe.")

    exe_path = os.path.abspath(sys.executable)
    app_dir = os.path.dirname(exe_path)
    proc = subprocess.Popen(
        [
            "powershell",
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            script_path,
            "-ZipPath",
            zip_path,
            "-AppDir",
            app_dir,
            "-ExeName",
            os.path.basename(exe_path),
            "-WaitPid",
            str(os.getpid()),
        ],
        cwd=app_dir,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0) | getattr(subprocess, "DETACHED_PROCESS", 0),
    )
    print(f"[UPDATE] Spawned updater pid={proc.pid} zip={zip_path}")


_cleanup_stale_pending_update_state()


class _TeeLogStream:
    def __init__(self, file_handle, original_stream=None):
        self._file_handle = file_handle
        self._original_stream = original_stream
        self.encoding = "utf-8"

    def write(self, data):
        if data is None:
            return 0
        text = data if isinstance(data, str) else str(data)
        written = 0
        try:
            self._file_handle.write(text)
            written = len(text)
        except Exception:
            pass
        if self._original_stream is not None:
            try:
                self._original_stream.write(text)
            except Exception:
                pass
        return written

    def flush(self):
        try:
            self._file_handle.flush()
        except Exception:
            pass
        if self._original_stream is not None:
            try:
                self._original_stream.flush()
            except Exception:
                pass

    def isatty(self):
        return False


def _setup_runtime_logging() -> None:
    """
    Với bản .exe windowed, stdout/stderr thường không có console.
    Redirect toàn bộ print/traceback vào file log để vẫn support debug.
    """
    if not getattr(sys, "frozen", False):
        return
    try:
        file_handle = open(APP_LOG_FILE, "a", encoding="utf-8", buffering=1)
        sys.stdout = _TeeLogStream(file_handle, getattr(sys, "stdout", None))
        sys.stderr = _TeeLogStream(file_handle, getattr(sys, "stderr", None))
        print("\n" + "=" * 80)
        print(f"[LOG] EcoHub runtime started at {datetime.now().isoformat(timespec='seconds')}")
        print(f"[LOG] Writing runtime logs to: {APP_LOG_FILE}")
    except Exception as e:
        try:
            print(f"[LOG] Không thiết lập được file log runtime: {e}")
        except Exception:
            pass


_setup_runtime_logging()


def _ensure_bootstrap_admin_user() -> None:
    """
    Nếu DB user trống, tạo tài khoản admin ban đầu từ env để bootstrap.
    """
    try:
        if count_auth_users(USER_AUTH_DB) > 0:
            return
        boot_user = (
            (os.environ.get("ECOHUB_BOOTSTRAP_ADMIN_USERNAME") or "").strip()
            or (os.environ.get("ECOHUB_AUTH_USERNAME") or "").strip()
        )
        boot_pass = (
            (os.environ.get("ECOHUB_BOOTSTRAP_ADMIN_PASSWORD") or "").strip()
            or (os.environ.get("ECOHUB_AUTH_PASSWORD") or "").strip()
        )
        if not boot_user or not boot_pass:
            return
        create_auth_user(USER_AUTH_DB, boot_user, boot_pass, role="admin")
        print(f"[AUTH] Bootstrap admin created: {boot_user}")
    except Exception as e:
        print(f"[AUTH] Bootstrap admin error: {e}")


_ensure_bootstrap_admin_user()

# Copy default config files if not exist (for first run)
import shutil
if not os.path.exists(CONFIG_FILE):
    default_config = os.path.join(BASE_DIR, "config.json")
    if os.path.exists(default_config):
        shutil.copy(default_config, CONFIG_FILE)
        print(f"[STARTUP] Copied default config.json to {CONFIG_FILE}")

if not os.path.exists(CONFIG_KEY_FILE):
    default_key = os.path.join(BASE_DIR, "config.key")
    if os.path.exists(default_key):
        shutil.copy(default_key, CONFIG_KEY_FILE)
        print(f"[STARTUP] Copied config.key to {CONFIG_KEY_FILE}")

MAX_RESUME_MINUTES = 10
MAX_CAMERAS = 2  # tối đa số camera quét cùng lúc

# Flask app với paths cho PyInstaller
template_folder = os.path.join(BASE_DIR, 'templates')
static_folder = os.path.join(BASE_DIR, 'static')

app = Flask(__name__, 
            template_folder=template_folder,
            static_folder=static_folder)
app.secret_key = (os.environ.get("ECOHUB_SECRET_KEY") or "ecohub-secret-key-change-me").strip()
app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 0  # giảm cache static để test dễ hơn
try:
    remember_days = max(1, int((os.environ.get("ECOHUB_REMEMBER_ME_DAYS") or "30").strip()))
except Exception:
    remember_days = 30
app.permanent_session_lifetime = timedelta(days=remember_days)

# Bảo vệ đăng nhập
try:
    LOGIN_FAIL_THRESHOLD = max(1, int((os.environ.get("ECOHUB_LOGIN_FAIL_THRESHOLD") or "3").strip()))
except Exception:
    LOGIN_FAIL_THRESHOLD = 3
try:
    LOGIN_LOCK_MINUTES = max(1, int((os.environ.get("ECOHUB_LOGIN_LOCK_MINUTES") or "15").strip()))
except Exception:
    LOGIN_LOCK_MINUTES = 15
try:
    LOGIN_CAPTCHA_AFTER_FAILS = max(1, int((os.environ.get("ECOHUB_LOGIN_CAPTCHA_AFTER_FAILS") or "3").strip()))
except Exception:
    LOGIN_CAPTCHA_AFTER_FAILS = 3
LOGIN_LOCK_SECONDS = LOGIN_LOCK_MINUTES * 60
login_fail_tracker: dict[str, dict[str, float | int]] = {}
ENABLE_EMAIL_RESET = (os.environ.get("ECOHUB_ENABLE_EMAIL_RESET") or "0").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}

# Timezone GMT+7 — khai báo sớm; dùng cho filter Jinja và toàn bộ app
GMT7 = timezone(timedelta(hours=7))


def _vn_datetime_filter(value: Any) -> str:
    """Chuyển Unix timestamp sang chuỗi hiển thị theo giờ Việt Nam (GMT+7)."""
    if value is None or value == "":
        return "—"
    try:
        ts = int(value)
        if ts <= 0:
            return "—"
        dt = datetime.fromtimestamp(ts, tz=GMT7)
        return dt.strftime("%H:%M %d/%m/%Y")
    except (ValueError, TypeError, OSError):
        return str(value)


app.jinja_env.filters["vn_datetime"] = _vn_datetime_filter


@app.after_request
def _disable_cache_for_tts_assets(response):
    """
    Tránh cache gây hiểu nhầm khi đang phát triển luồng âm thanh/token.
    Chỉ áp dụng cho JS chính và các file TTS token.
    """
    try:
        path = (request.path or "")
        if path.endswith("/static/js/main.js") or path.startswith("/static/audio/tts/"):
            response.headers["Cache-Control"] = "no-store, max-age=0"
    except Exception:
        pass
    return response

print(f"[STARTUP] Version: {APP_VERSION}")
print(f"[STARTUP] BASE_DIR: {BASE_DIR}")
print(f"[STARTUP] DATA_DIR: {DATA_DIR}")
print(f"[STARTUP] Templates: {template_folder}")
print(f"[STARTUP] Static: {static_folder}")
print(f"[STARTUP] Videos: {VIDEOS_DIR}")


# ==========================
# UPLOAD QUEUE SYSTEM
# ==========================
from queue import Queue
from dataclasses import dataclass, field


@dataclass
class UploadTask:
    """Thông tin video cần upload"""
    filename: str
    path: str
    order_code: str
    status: str = "pending"  # pending, uploading, success, failed
    error_msg: str = ""
    created_at: datetime = field(default_factory=lambda: datetime.now(GMT7))
    # Liên kết tới bản ghi metadata (SQLite). Có thể None với video cũ hoặc POC chưa dùng metadata.
    video_id: int | None = None
    
upload_queue = Queue()  # Queue FIFO để upload tuần tự
upload_status_lock = threading.Lock()
upload_status_dict = {}  # {filename: UploadTask} - theo dõi trạng thái


def _cleanup_old_upload_history():
    """
    Cleanup lịch sử upload HẾT NGÀY (00:00).
    Xóa tất cả videos KHÔNG phải ngày hôm nay.
    """
    try:
        current_time = datetime.now(GMT7)
        # Lấy ngày hiện tại (00:00:00)
        today_start = current_time.replace(hour=0, minute=0, second=0, microsecond=0)
        
        with upload_status_lock:
            # Xóa tất cả tasks KHÔNG phải ngày hôm nay
            old_keys = [
                filename for filename, task in upload_status_dict.items()
                if task.created_at < today_start
            ]
            
            for key in old_keys:
                del upload_status_dict[key]
            
            if old_keys:
                print(f"[CLEANUP] Removed {len(old_keys)} old upload records (previous days). "
                      f"Current size: {len(upload_status_dict)}")
    except Exception as e:
        print(f"[CLEANUP] Error cleaning old upload history: {e}")


def _auto_queue_local_videos():
    """
    Tự động quét video local và đưa vào upload queue nếu chưa có.
    Được gọi khi truy cập trang storage.
    """
    try:
        if not os.path.exists(VIDEOS_DIR):
            return

        for root, _, files in os.walk(VIDEOS_DIR):
            for basename in files:
                if not basename.endswith((".mp4", ".avi")):
                    continue

                file_path = os.path.join(root, basename)
                filename = os.path.relpath(file_path, VIDEOS_DIR).replace("\\", "/")

                with upload_status_lock:
                    if filename in upload_status_dict:
                        continue

                order_code = "unknown"
                try:
                    base_name = basename.replace(".mp4", "").replace(".avi", "")
                    parts = base_name.rsplit("_", 3)
                    if len(parts) >= 1:
                        order_code = parts[0]
                except Exception:
                    pass

                task = UploadTask(
                    filename=filename,
                    path=file_path,
                    order_code=order_code,
                    status="pending"
                )

                with upload_status_lock:
                    upload_status_dict[filename] = task

                upload_queue.put(task)
                print(f"[AUTO QUEUE] Added to upload queue: {filename}")
    
    except Exception as e:
        print(f"[AUTO QUEUE] Error scanning local videos: {e}")


def upload_worker():
    """
    Worker thread để xử lý upload queue tuần tự.
    Đảm bảo mỗi lần chỉ upload 1 video để tránh mất dữ liệu.
    """
    print("[UPLOAD WORKER] Started")
    last_cleanup_time = time.time()
    CLEANUP_INTERVAL = 300.0  # Cleanup mỗi 5 phút (check để xóa videos ngày cũ)
    
    while True:
        task = None
        try:
            # Lấy task từ queue (blocking với timeout)
            try:
                task = upload_queue.get(timeout=1)
            except:
                # Queue empty, check cleanup và continue loop
                current_time = time.time()
                if current_time - last_cleanup_time >= CLEANUP_INTERVAL:
                    _cleanup_old_upload_history()
                    last_cleanup_time = current_time
                continue
            
            # Cập nhật status = uploading
            with upload_status_lock:
                task.status = "uploading"
                upload_status_dict[task.filename] = task
            
            print(f"[UPLOAD WORKER] Uploading: {task.filename}")
            
            # Local-only mode: giữ nguyên file trên máy, chỉ hoàn tất metadata/trạng thái.
            try:
                if task.video_id is not None:
                    try:
                        # Tái sử dụng cờ hiện có như mốc "đã hoàn tất xử lý" để logic cleanup không đổi.
                        mark_uploaded(VIDEO_METADATA_DB, task.video_id)
                    except Exception as meta_e:
                        print(f"[UPLOAD WORKER] Error marking video {task.video_id} as completed: {meta_e}")

                with upload_status_lock:
                    task.status = "success"
                    task.error_msg = ""
                    upload_status_dict[task.filename] = task

                print(f"[UPLOAD WORKER] Local-only mode, kept file on disk: {task.path}")

                try:
                    enforce_video_storage_limit(None)
                except Exception as limit_e:
                    print(f"[STORAGE LIMIT] Error enforcing limit after local finalize: {limit_e}")
            except Exception as local_e:
                print(f"[UPLOAD WORKER] Local finalize exception: {str(local_e)}")
                with upload_status_lock:
                    task.status = "failed"
                    task.error_msg = str(local_e)
                    upload_status_dict[task.filename] = task
            
            if task:
                upload_queue.task_done()
            
            # Cleanup old upload history sau mỗi task
            current_time = time.time()
            if current_time - last_cleanup_time >= CLEANUP_INTERVAL:
                _cleanup_old_upload_history()
                last_cleanup_time = current_time
            
        except Exception as e:
            print(f"[UPLOAD WORKER] Unexpected error: {str(e)}")
            if task:
                try:
                    upload_queue.task_done()
                except:
                    pass
            time.sleep(1)


# ==========================
# TRẠNG THÁI TOÀN CỤC
# ==========================
#
# state_lock bảo vệ mọi truy cập/ghi app_state để tránh race condition
# giữa các thread (camera, AI scanner, upload worker, Flask request).
# app_state chỉ lưu những thứ "phiên hiện tại" – không phải dữ liệu lâu dài.
# Khi bạn reset đơn hoặc dừng quay, app_state được đưa về trạng thái sạch.

state_lock = threading.Lock()
app_state = {
    "is_recording": False,
    "recording_start": None,
    "recording_order_code": None,
    "recording_order_id": None,
    "current_order_code": None,
    "current_order_info": None,
    # Giữ tương thích cho các màn hình cũ, nhưng vận hành thực tế chỉ giữ tối đa 1 order hiện tại.
    # Mỗi phần tử: {"id": str, "order_code": str, "order_info": dict|None, "serial_state": dict, "packing_evaluation": dict|None, "created_at": float}
    "order_queue": [],
    # current_order_* sẽ mirror theo entry duy nhất hiện tại.
    "current_order_id": None,
    # Thông báo realtime (đẩy về frontend qua /status). Mỗi phần tử: {"level": "info"|"warning"|"error", "message": str, "ts": float}
    "notifications": [],
    "auto_record_on_qr": True,  # Tự động quay khi quét được QR
    # POC mới: chỉ có 1 loại mã (QR/Barcode) đại diện cho đơn. Nếu đơn hợp lệ thì auto quay.
    "auto_record_on_code": True,
    "is_paused": False,
    # serial_state: trạng thái quét serial trong POC hiện tại.
    # Để đơn giản, POC gom toàn bộ số lượng sản phẩm trong đơn
    # thành một "bucket" duy nhất "__all__" thay vì theo từng dòng sản phẩm.
    # Sau này khi có API thật và mapping serial → OrderItem,
    # ta chỉ cần thay đổi cấu trúc này cho chi tiết hơn.
    "serial_state": {},
    # packing_evaluation: snapshot đánh giá số lượng đã quét so với yêu cầu.
    # Được tính lại sau mỗi lần quét serial và dùng để:
    # - Trả về frontend qua /status
    # - Hiển thị cảnh báo/tiến độ đóng gói cho người vận hành.
    "packing_evaluation": None,
    "recent_serial_events": [],
    # Tăng mỗi khi quét xử lý đơn thành công hoặc yêu cầu đọc lại TTS (cooldown); FE dùng để phát âm thanh mỗi lần quét.
    "order_audio_nonce": 0,
    # outbound = hàng gửi, return = hàng hoàn (ảnh hưởng thư mục lưu video)
    "recording_flow": storage_service.RECORDING_FLOW_OUTBOUND,
}

def normalize_scanned_code(raw_code: str) -> str:
    """
    Chuẩn hóa chuỗi mã quét:
    - trim
    - loại bỏ dấu/Unicode lạ do IME (đặc biệt khi scanner giả lập keyboard)
    """
    if not raw_code or not isinstance(raw_code, str):
        return ""
    s = raw_code.strip()
    if not s:
        return ""
    try:
        import unicodedata

        nfkd = unicodedata.normalize("NFKD", s)
        ascii_only = "".join(ch for ch in nfkd if ord(ch) < 128)
        return (ascii_only.strip() or s).strip()
    except Exception:
        return s

def _push_notification(message: str, level: str = "info") -> None:
    try:
        lvl = (level or "info").strip().lower()
        if lvl not in ("info", "warning", "error"):
            lvl = "info"
        app_state.get("notifications", []).append({"level": lvl, "message": str(message), "ts": time.time()})
        # Tránh phình vô hạn nếu client không poll
        if len(app_state.get("notifications", [])) > 50:
            app_state["notifications"] = app_state["notifications"][-50:]
    except Exception:
        pass


def _queue_find_entry_by_id(order_id: str | None) -> dict | None:
    if not order_id:
        return None
    q = app_state.get("order_queue") or []
    for e in q:
        if (e or {}).get("id") == order_id:
            return e
    return None


def _queue_find_entry_by_code(order_code: str) -> dict | None:
    if not order_code:
        return None
    q = app_state.get("order_queue") or []
    for e in q:
        if (e or {}).get("order_code") == order_code:
            return e
    return None


def _queue_remove_entry_by_id(order_id: str | None) -> bool:
    if not order_id:
        return False
    q = app_state.get("order_queue") or []
    before = len(q)
    app_state["order_queue"] = [e for e in q if (e or {}).get("id") != order_id]
    return len(app_state["order_queue"]) != before


def _push_recent_serial_event(order_id: str | None, order_code: str | None, serial_code: str) -> None:
    if not serial_code:
        return
    events = app_state.get("recent_serial_events")
    if not isinstance(events, list):
        events = []
        app_state["recent_serial_events"] = events
    events.append(
        {
            "order_id": order_id,
            "order_code": order_code,
            "serial_code": serial_code,
            "ts": time.time(),
        }
    )
    if len(events) > 50:
        app_state["recent_serial_events"] = events[-50:]


def _queue_set_current(order_id: str | None) -> None:
    """
    Set đơn đang xử lý theo order_id và mirror ra các field current_* để phần còn lại của app dùng chung.
    """
    app_state["current_order_id"] = order_id
    entry = _queue_find_entry_by_id(order_id)
    if not entry:
        app_state["current_order_code"] = None
        app_state["current_order_info"] = None
        app_state["serial_state"] = {}
        app_state["packing_evaluation"] = None
        return

    app_state["current_order_code"] = entry.get("order_code")
    app_state["current_order_info"] = entry.get("order_info")
    app_state["serial_state"] = entry.get("serial_state") or {}
    app_state["packing_evaluation"] = entry.get("packing_evaluation")


def _queue_advance_to_next() -> None:
    """
    Chuyển sang đơn tiếp theo trong queue (phần tử kế sau đơn hiện tại khi đơn hiện tại là phần tử đầu).
    Nếu queue rỗng thì clear current.
    """
    q = app_state.get("order_queue") or []
    if not q:
        _queue_set_current(None)
        return
    # Nếu current đang là phần tử đầu tiên thì chuyển sang phần tử tiếp theo, nếu không thì chọn phần tử đầu
    cur_id = app_state.get("current_order_id")
    if cur_id and q and (q[0] or {}).get("id") == cur_id:
        if len(q) >= 2:
            _queue_set_current((q[1] or {}).get("id"))
        else:
            _queue_set_current(None)
    else:
        _queue_set_current((q[0] or {}).get("id"))


def _set_single_active_order(entry: dict | None) -> None:
    """
    Luồng vận hành hiện tại chỉ giữ 1 phiên order duy nhất.
    Vẫn mirror qua order_queue/current_* để các màn hình cũ không vỡ.
    """
    if not entry:
        app_state["order_queue"] = []
        _queue_set_current(None)
        return
    app_state["order_queue"] = [entry]
    _queue_set_current(entry.get("id"))


def _annotate_recording_frame(frame):
    if frame is None:
        return frame

    with state_lock:
        recording_order_id = app_state.get("recording_order_id")
        recording_order_code = app_state.get("recording_order_code") or app_state.get("current_order_code") or ""
        recorded_entry = _queue_find_entry_by_id(recording_order_id)
        packing_state = (recorded_entry or {}).get("packing_evaluation") or app_state.get("packing_evaluation") or {}
        recent_events = list(app_state.get("recent_serial_events") or [])
        recording_flow = app_state.get("recording_flow") or storage_service.RECORDING_FLOW_OUTBOUND

    overlay = frame.copy()
    lines = []

    if recording_order_code:
        lines.append(f"ORDER: {recording_order_code}")

    lines.append(f"LOAI: {storage_service.recording_flow_label(recording_flow).upper()}")

    items = packing_state.get("items") or []
    if items:
        first = items[0] or {}
        scanned_count = int(first.get("scanned_count", 0) or 0)
        required_qty = int(first.get("required_qty", 0) or 0)
        lines.append(f"SERIAL: {scanned_count}/{required_qty}")

    serial_lines = []
    for event in reversed(recent_events):
        if recording_order_id and event.get("order_id") != recording_order_id:
            continue
        if (event.get("order_code") or "") != recording_order_code:
            continue
        serial_code = (event.get("serial_code") or "").strip()
        if serial_code and serial_code not in serial_lines:
            serial_lines.append(serial_code)
        if len(serial_lines) >= 3:
            break

    for serial_code in serial_lines:
        lines.append(f"SCAN: {serial_code}")

    if not lines:
        return frame

    line_height = 32
    margin = 18
    block_height = margin + line_height * len(lines) + 10
    cv2.rectangle(overlay, (12, 12), (660, block_height), (0, 0, 0), -1)
    frame = cv2.addWeighted(overlay, 0.45, frame, 0.55, 0)

    y = 42
    for idx, text in enumerate(lines):
        color = (255, 255, 255) if idx < 2 else (0, 255, 255)
        cv2.putText(
            frame,
            text,
            (24, y),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.82,
            color,
            2,
            cv2.LINE_AA,
        )
        y += line_height

    return frame


# ==========================
# NHIỀU CAMERA: CONFIG + MANAGERS + SCANNERS
# ==========================

def _default_camera_config():
    return {
        "slot_index": 0,
        "source_type": SOURCE_USB,
        "camera_index": 0,
        "rtsp_url": "",
        "width": CameraManager.DEFAULT_WIDTH,
        "height": CameraManager.DEFAULT_HEIGHT,
        "fps": CameraManager.DEFAULT_FPS,
    }


def _normalize_employee_session(payload: dict | None) -> dict:
    payload = payload or {}
    return {
        "employee_name": str(payload.get("employee_name") or "").strip(),
        "employee_code": str(payload.get("employee_code") or "").strip(),
        "work_session_label": str(payload.get("work_session_label") or "").strip(),
    }


def _normalize_recording_camera_slot(recording_camera_slot, configs: list[dict] | None) -> int:
    configs = list(configs or [])
    if not configs:
        return 0
    valid_slots: list[int] = []
    for idx, cfg in enumerate(configs):
        slot = cfg.get("slot_index", idx)
        try:
            valid_slots.append(int(slot))
        except (TypeError, ValueError):
            valid_slots.append(idx)
    try:
        selected = int(recording_camera_slot)
    except (TypeError, ValueError):
        selected = valid_slots[0]
    if selected not in valid_slots:
        selected = valid_slots[0]
    return selected


def _load_recording_camera_slot(configs: list[dict] | None = None) -> int:
    raw_config = _read_json_config_safe()
    return _normalize_recording_camera_slot(raw_config.get("recording_camera_slot", 0), configs or [])


def load_config():
    """
    Đọc cấu hình từ file config.json (nếu có).
    Trả về: (camera_configs, scan_sensitivity, scan_interval_sec, auto_record_on_qr, storage_mode, s3_config, qr_cooldown_seconds)
    """
    if not os.path.exists(CONFIG_FILE):
        return ([_default_camera_config()], SENSITIVITY_NORMAL, 0.05, True, LOCAL_STORAGE_MODE, None, 5)
    try:
        with open(CONFIG_FILE, "r", encoding="utf-8-sig") as f:
            data = json.load(f)
        configs = data.get("camera_configs", [_default_camera_config()])
        sensitivity = data.get("scan_sensitivity", SENSITIVITY_NORMAL)
        # Luôn bật auto quay theo mã đơn; không cho config cũ tắt tính năng này.
        auto_record = True
        qr_cooldown = int(data.get("qr_cooldown_seconds", 5) or 5)
        if qr_cooldown < 1:
            qr_cooldown = 1
        if qr_cooldown > 60:
            qr_cooldown = 60
        storage_mode = LOCAL_STORAGE_MODE
        
        interval_map = {SENSITIVITY_LOW: 0.1, SENSITIVITY_NORMAL: 0.05, SENSITIVITY_HIGH: 0.03}
        interval = interval_map.get(sensitivity, 0.05)
        
        # Load S3 config (decrypt sensitive data)
        s3_config = None
        if "s3_config" in data:
            s3_data = data["s3_config"]
            s3_config = S3Config(
                endpoint=s3_data.get("endpoint", ""),
                access_key=encryptor.decrypt(s3_data.get("access_key", "")),
                secret_key=encryptor.decrypt(s3_data.get("secret_key", "")),
                bucket=s3_data.get("bucket", ""),
                region=s3_data.get("region", "hn-2"),
                prefix=s3_data.get("prefix", ""),
            )
        
        return (configs, sensitivity, interval, auto_record, storage_mode, s3_config, qr_cooldown)
    except Exception as e:
        print("Loi doc config.json: %s" % str(e))
        return ([_default_camera_config()], SENSITIVITY_NORMAL, 0.05, True, LOCAL_STORAGE_MODE, None, 5)


def save_config(
    configs,
    scan_sensitivity,
    auto_record_on_qr=True,
    storage_mode=LOCAL_STORAGE_MODE,
    s3_config=None,
    qr_cooldown_seconds: int = 5,
    employee_session=None,
    recording_camera_slot=None,
):
    """
    Ghi cấu hình vào file config.json.
    QUAN TRỌNG: Nếu s3_config = None, sẽ giữ lại s3_config hiện có trong file.
    """
    try:
        # Load config hiện tại để giữ lại s3_config nếu không truyền vào
        existing_s3_config = None
        existing_employee_session = None
        existing_recording_camera_slot = None
        if os.path.exists(CONFIG_FILE):
            try:
                with open(CONFIG_FILE, "r", encoding="utf-8-sig") as f:
                    existing_data = json.load(f)
                    if "s3_config" in existing_data:
                        existing_s3_config = existing_data["s3_config"]
                    if "employee_session" in existing_data:
                        existing_employee_session = existing_data["employee_session"]
                    if "recording_camera_slot" in existing_data:
                        existing_recording_camera_slot = existing_data["recording_camera_slot"]
            except:
                pass

        data = {
            "camera_configs": configs,
            "scan_sensitivity": scan_sensitivity,
            "auto_record_on_qr": auto_record_on_qr,
            "storage_mode": LOCAL_STORAGE_MODE,
            "qr_cooldown_seconds": int(qr_cooldown_seconds or 5),
        }
        data["recording_camera_slot"] = _normalize_recording_camera_slot(
            recording_camera_slot if recording_camera_slot is not None else existing_recording_camera_slot,
            configs,
        )
        
        # Lưu S3 config (encrypt sensitive data)
        if s3_config:
            data["s3_config"] = {
                "endpoint": s3_config.endpoint,
                "access_key": encryptor.encrypt(s3_config.access_key),
                "secret_key": encryptor.encrypt(s3_config.secret_key),
                "bucket": s3_config.bucket,
                "region": s3_config.region,
                "prefix": s3_config.prefix,
            }
        elif existing_s3_config:
            # Giữ lại s3_config cũ nếu không truyền vào
            data["s3_config"] = existing_s3_config

        normalized_employee_session = _normalize_employee_session(employee_session)
        if any(normalized_employee_session.values()):
            data["employee_session"] = normalized_employee_session
        elif existing_employee_session:
            data["employee_session"] = _normalize_employee_session(existing_employee_session)

        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print("Loi ghi config.json: %s" % str(e))


# Danh sách cấu hình camera (ít nhất 1, tối đa MAX_CAMERAS). Nguồn sự thật để tạo managers/scanners.
camera_configs = [_default_camera_config()]

# Danh sách CameraManager và AIBarcodeScanner (mỗi camera 1 cặp). Recorder gắn vào camera 0.
camera_managers = []
ai_scanners = []
recorder = VideoRecorder()
recorder.set_overlay_callback(_annotate_recording_frame)

# S3 Service cho upload video
s3_service = S3Service()

# Encryption cho sensitive data (use CONFIG_KEY_FILE from DATA_DIR)
encryptor = get_encryptor(CONFIG_KEY_FILE)

# ==========================
# CẤU HÌNH GIỚI HẠN DUNG LƯỢNG VIDEO
# ==========================
#
# Mục tiêu:
# - Cho phép cấu hình giới hạn dung lượng/tổng số video/tổng thời lượng ở mức GLOBAL.
# - Sẵn sàng mở rộng per-shop qua hàm get_shop_video_limits(shop_id).
#
# Quy ước:
# - DEFAULT_* dùng khi không có cấu hình nào (env + config.json đều trống).
# - max_count / max_duration_min = 0 nghĩa là "không giới hạn" (unlimited) cho POC.

DEFAULT_VIDEO_STORAGE_LIMIT_GB = 0.0   # 0 = không giới hạn dung lượng video local
DEFAULT_VIDEO_MAX_COUNT = 0            # 0 = không giới hạn số lượng video
DEFAULT_VIDEO_MAX_DURATION_MIN = 0     # 0 = không giới hạn tổng thời lượng (phút)


def _read_json_config_safe() -> dict:
    """
    Đọc config.json thô, NEVER raise exception (trả về {} nếu lỗi).
    Dùng chung cho các hàm cấu hình khác để tránh lặp code.
    """
    if not os.path.exists(CONFIG_FILE):
        return {}
    try:
        with open(CONFIG_FILE, "r", encoding="utf-8-sig") as f:
            return json.load(f) or {}
    except Exception as e:
        print(f"[CONFIG] Error reading JSON config: {e}")
        return {}


def _get_active_employee_session() -> dict:
    raw_config = _read_json_config_safe()
    session_info = _normalize_employee_session(raw_config.get("employee_session"))
    if not session_info.get("employee_name"):
        try:
            current_user = session.get("user") or {}
            session_info["employee_name"] = str(current_user.get("username") or "").strip()
        except Exception:
            pass
    if not session_info.get("employee_code"):
        session_info["employee_code"] = "unknown_employee"
    if not session_info.get("work_session_label"):
        session_info["work_session_label"] = "ca"
    return session_info


def _normalize_recording_flow(raw: str | None) -> str:
    return storage_service.normalize_recording_flow(raw)


def _get_recording_flow() -> str:
    """Chế độ quay hiện tại (ưu tiên phiên Flask, fallback app_state)."""
    try:
        flow = session.get("recording_flow")
    except Exception:
        flow = None
    if not flow:
        with state_lock:
            flow = app_state.get("recording_flow")
    return _normalize_recording_flow(flow)


def _set_recording_flow(flow: str) -> tuple[str, str | None]:
    """
    Đặt chế độ hàng gửi/hàng hoàn. Trả về (flow, error_message).
    Không đổi khi đang quay.
    """
    normalized = _normalize_recording_flow(flow)
    with state_lock:
        if app_state.get("is_recording"):
            return normalized, "Đang quay video — không thể đổi chế độ hàng gửi/hàng hoàn."
        app_state["recording_flow"] = normalized
    try:
        session["recording_flow"] = normalized
    except Exception:
        pass
    return normalized, None


def _get_env_video_limits() -> dict:
    """
    Đọc giới hạn dung lượng video từ ENV (nếu có).

    Ưu tiên:
    - VIDEO_STORAGE_LIMIT_GB
    - VIDEO_MAX_COUNT
    - VIDEO_MAX_DURATION_MIN
    """
    limit_gb = None
    max_count = None
    max_duration = None

    raw_limit = os.environ.get("VIDEO_STORAGE_LIMIT_GB")
    if raw_limit:
        try:
            limit_gb = float(raw_limit)
        except ValueError:
            print(f"[CONFIG] Invalid VIDEO_STORAGE_LIMIT_GB='{raw_limit}', using defaults.")

    raw_count = os.environ.get("VIDEO_MAX_COUNT")
    if raw_count:
        try:
            max_count = int(raw_count)
        except ValueError:
            print(f"[CONFIG] Invalid VIDEO_MAX_COUNT='{raw_count}', ignoring.")

    raw_duration = os.environ.get("VIDEO_MAX_DURATION_MIN")
    if raw_duration:
        try:
            max_duration = int(raw_duration)
        except ValueError:
            print(f"[CONFIG] Invalid VIDEO_MAX_DURATION_MIN='{raw_duration}', ignoring.")

    return {
        "storage_limit_gb": limit_gb,
        "max_count": max_count,
        "max_duration_min": max_duration,
    }


def get_global_video_limits() -> dict:
    """
    Bản local cho khách hiện để video lưu thoải mái:
    - Không giới hạn dung lượng
    - Không giới hạn số lượng
    - Không giới hạn tổng thời lượng

    Trả về dict:
    {
      "storage_limit_gb": float,   # tổng dung lượng tối đa cho video
      "max_count": int,            # số lượng video tối đa (0 = không giới hạn)
      "max_duration_min": int,     # tổng thời lượng video tối đa (0 = không giới hạn)
    }
    """
    return {
        "storage_limit_gb": DEFAULT_VIDEO_STORAGE_LIMIT_GB,
        "max_count": DEFAULT_VIDEO_MAX_COUNT,
        "max_duration_min": DEFAULT_VIDEO_MAX_DURATION_MIN,
    }


def get_shop_video_limits(shop_id: str | None) -> dict:
    """
    Lấy cấu hình giới hạn dung lượng video cho một shop cụ thể.

    POC hiện tại:
    - Chưa có multi-shop thật → luôn trả về cấu hình GLOBAL.
    - Sau này có thể map shop_id → cấu hình riêng (DB/config khác).
    """
    # TODO: Khi có cơ chế multi-tenant, thay logic này bằng:
    # 1) Đọc cấu hình riêng của shop (nếu có)
    # 2) Fallback về get_global_video_limits() nếu shop không có cấu hình riêng
    return get_global_video_limits()


def get_video_storage_usage(shop_id: str | None) -> dict:
    """
    Tính toán tình trạng sử dụng dung lượng video cho 1 shop.

    Đầu ra:
    {
      "shop_id": str | None,
      "storage_limit_gb": float,
      "used_bytes": int,
      "used_gb": float,
      "percent_used": float,        # 0–100
      "video_count": int,
      "total_duration_sec": int,
      "total_duration_min": float,
    }
    """
    limits = get_shop_video_limits(shop_id)
    videos = list_active_videos_for_shop(VIDEO_METADATA_DB, shop_id)

    total_size_bytes = 0
    total_duration_sec = 0
    total_count = 0

    for v in videos:
        # videos đã được filter is_deleted=0 trong list_active_videos_for_shop
        total_size_bytes += int(v.size_bytes or 0)
        total_duration_sec += int(v.duration_sec or 0)
        total_count += 1

    storage_limit_gb = float(limits.get("storage_limit_gb") or 0.0)
    used_gb = total_size_bytes / (1024.0 * 1024.0 * 1024.0) if total_size_bytes > 0 else 0.0

    percent_used = 0.0
    if storage_limit_gb > 0:
        percent_used = (used_gb / storage_limit_gb) * 100.0
        if percent_used < 0:
            percent_used = 0.0
        if percent_used > 999.0:
            percent_used = 999.0

    total_duration_min = total_duration_sec / 60.0 if total_duration_sec > 0 else 0.0

    # Giới hạn theo số lượng và thời lượng (optional – dùng cho hiển thị / mở rộng cleanup)
    max_count = int(limits.get("max_count") or 0)
    max_duration_min = int(limits.get("max_duration_min") or 0)
    percent_used_count = 0.0
    percent_used_duration = 0.0
    if max_count > 0 and total_count > 0:
        percent_used_count = min(999.0, (total_count / max_count) * 100.0)
    if max_duration_min > 0 and total_duration_min > 0:
        percent_used_duration = min(999.0, (total_duration_min / max_duration_min) * 100.0)

    return {
        "shop_id": shop_id,
        "storage_limit_gb": storage_limit_gb,
        "used_bytes": total_size_bytes,
        "used_gb": used_gb,
        "percent_used": percent_used,
        "video_count": total_count,
        "total_duration_sec": total_duration_sec,
        "total_duration_min": total_duration_min,
        "max_count": max_count,
        "max_duration_min": max_duration_min,
        "percent_used_count": percent_used_count,
        "percent_used_duration": percent_used_duration,
    }


VIDEO_STORAGE_SAFE_THRESHOLD_PERCENT = 95.0


def _usage_exceeds_cleanup_threshold(usage: dict) -> bool:
    """True nếu ít nhất một trong: dung lượng, số lượng, thời lượng vượt ngưỡng 95%."""
    pct = usage.get("percent_used") or 0.0
    if pct >= VIDEO_STORAGE_SAFE_THRESHOLD_PERCENT:
        return True
    max_count = int(usage.get("max_count") or 0)
    max_duration_min = int(usage.get("max_duration_min") or 0)
    if max_count > 0 and (usage.get("percent_used_count") or 0.0) >= VIDEO_STORAGE_SAFE_THRESHOLD_PERCENT:
        return True
    if max_duration_min > 0 and (usage.get("percent_used_duration") or 0.0) >= VIDEO_STORAGE_SAFE_THRESHOLD_PERCENT:
        return True
    return False


def _usage_below_threshold_after(used_bytes: int, total_count: int, total_duration_sec: int,
                                  limit_gb: float, max_count: int, max_duration_min: int) -> bool:
    """True nếu sau khi trừ (used_bytes, total_count, total_duration_sec) thì tất cả dưới ngưỡng 95%."""
    if limit_gb > 0:
        used_gb = used_bytes / (1024.0 * 1024.0 * 1024.0)
        if (used_gb / limit_gb) * 100.0 >= VIDEO_STORAGE_SAFE_THRESHOLD_PERCENT:
            return False
    if max_count > 0 and total_count > 0:
        if (total_count / max_count) * 100.0 >= VIDEO_STORAGE_SAFE_THRESHOLD_PERCENT:
            return False
    if max_duration_min > 0:
        duration_min = total_duration_sec / 60.0
        if duration_min > 0 and (duration_min / max_duration_min) * 100.0 >= VIDEO_STORAGE_SAFE_THRESHOLD_PERCENT:
            return False
    return True


def enforce_video_storage_limit(shop_id: str | None) -> dict:
    """
    Bản local hiện không auto cleanup theo giới hạn dung lượng.

    Trả về:
    {
      "before": usage_truoc,
      "after": usage_sau,
      "deleted_video_ids": [ ... ],
    }
    """
    before_usage = get_video_storage_usage(shop_id)
    return {
        "before": before_usage,
        "after": before_usage,
        "deleted_video_ids": [],
        "reason": "disabled_unlimited_local_storage",
    }

# ---------------------------------------------------------------------------
# Phân loại mã quét.
# Camera AI chỉ nhận mã đơn; scanner trên Dashboard nhận serial.
# ---------------------------------------------------------------------------
# Quy ước hiện tại: mã đơn chỉ gồm chữ số.


def is_valid_serial(code: str) -> bool:
    """
    Rule serial hợp lệ (tự định nghĩa trước):
    - Không rỗng
    - Tối thiểu 3 ký tự, chỉ gồm A-Z / 0-9 / '-' / '_'
    """
    if not code or not isinstance(code, str):
        return False
    c = code.strip().upper()
    if len(c) < 3:
        return False
    for ch in c:
        if not (("A" <= ch <= "Z") or ("0" <= ch <= "9") or ch in "-_"):
            return False
    return True


def looks_like_order_code(code: str) -> bool:
    """
    Rule nhận diện mã vận đơn / order id theo tiền tố cũ.

    Lưu ý: luồng mới không còn dùng rule này để mở đơn đầu tiên;
    mã đầu tiên quét được sẽ được coi là mã đơn. Hàm được giữ lại
    để tương thích nếu nơi khác trong code vẫn cần kiểm tra pattern cũ.
    """
    if not code or not isinstance(code, str):
        return False
    c = normalize_scanned_code(code).upper()
    if not c:
        return False
    return c.startswith(("57", "58", "SPX"))

def looks_like_serial_code(code: str) -> bool:
    """
    Kiểm tra mã quét có phải là mã serial sản phẩm không.
    Hiện tại serial là mọi mã đạt rule serial cơ bản.
    """
    return is_valid_serial(code)


def on_code_detected(code: str) -> str:
    """
    Callback cho AI scanner từ camera.
    Camera nhận mã linh hoạt; nếu quét nhầm có thể reset phiên để làm lại.

    Trả về:
        - "ok": đã xử lý thành công mã đơn.
        - "stop": quét lại đúng mã đơn đang quay để kết thúc quay.
        - "packing-incomplete": quét lại mã đơn nhưng chưa đủ serial.
        - "fail": lỗi xử lý.
    """
    code = normalize_scanned_code(code)
    if not code:
        return "fail"
    with state_lock:
        is_recording = app_state.get("is_recording", False)
        should_auto = bool(app_state.get("auto_record_on_qr", False))
    return _handle_order_code(code, should_auto_record=should_auto, is_recording=is_recording)


def _init_serial_state_for_order(order_info: dict) -> dict:
    """
    Khởi tạo serial_state cho 1 đơn.

    POC hiện tại gom toàn bộ số lượng sản phẩm thành một bucket "__all__".
    Điều này đủ để kiểm tra "đã quét đủ N serial chưa?" mà không cần biết
    serial thuộc dòng sản phẩm nào.
    """
    if not isinstance(order_info, dict):
        return {}
    items = order_info.get("items") or []
    try:
        required_qty = sum(int((it or {}).get("qty", 0) or 0) for it in items)
    except Exception:
        required_qty = 0
    if required_qty <= 0:
        return {}
    return {
        "__all__": {
            "required_qty": required_qty,
            # Dùng set để:
            # - Tự loại bỏ duplicate serial
            # - Cho phép đếm nhanh số serial khác nhau đã quét
            "scanned_serials": set(),
        }
    }


def _evaluate_packing_state(order_info: dict, serial_state: dict) -> dict:
    """
    Đánh giá trạng thái đóng gói dựa trên serial_state hiện tại.

    Đầu ra ở dạng đơn giản để frontend dễ render:
    {
      "items": [
        {
          "key": "__all__",
          "required_qty": 3,
          "scanned_count": 2,
          "status": "missing" | "ok" | "excess",
        }
      ],
      "has_missing": true/false,
      "has_excess": true/false
    }
    """
    evaluation = {
        "items": [],
        "has_missing": False,
        "has_excess": False,
    }

    if not isinstance(serial_state, dict) or not serial_state:
        return evaluation

    for key, state in serial_state.items():
        required = int((state or {}).get("required_qty", 0) or 0)
        scanned_serials = (state or {}).get("scanned_serials") or set()
        scanned_count = len(scanned_serials)

        if scanned_count < required:
            status = "missing"
            evaluation["has_missing"] = True
        elif scanned_count == required:
            status = "ok"
        else:
            status = "excess"
            evaluation["has_excess"] = True

        evaluation["items"].append(
            {
                "key": key,
                "required_qty": required,
                "scanned_count": scanned_count,
                "status": status,
            }
        )

    return evaluation


def _packing_blocks_stop(order_info: dict | None, serial_state: dict | None) -> tuple[bool, str, dict]:
    """
    Trả về (bị_chặn, thông_báo, evaluation).
    Chặn kết thúc quay khi đơn còn thiếu serial so với số lượng yêu cầu.
    """
    evaluation = _evaluate_packing_state(order_info or {}, serial_state or {})
    if not evaluation.get("has_missing"):
        return False, "", evaluation

    scanned = 0
    required = 0
    for item in evaluation.get("items") or []:
        if (item or {}).get("status") == "missing":
            scanned = int((item or {}).get("scanned_count", 0) or 0)
            required = int((item or {}).get("required_qty", 0) or 0)
            break

    if required <= 0:
        return False, "", evaluation

    msg = (
        f"Chưa quét đủ serial ({scanned}/{required}). "
        "Vui lòng quét đủ sản phẩm trước khi kết thúc quay."
    )
    return True, msg, evaluation


def _get_active_recording_packing_context() -> tuple[dict | None, dict]:
    """order_info + serial_state của phiên quay hiện tại."""
    with state_lock:
        recording_order_id = app_state.get("recording_order_id")
        code = app_state.get("recording_order_code") or app_state.get("current_order_code")
        recorded_entry = _queue_find_entry_by_id(recording_order_id)
        if not recorded_entry and code:
            recorded_entry = _queue_find_entry_by_code(code)
        order_info = (recorded_entry or {}).get("order_info") or app_state.get("current_order_info")
        serial_state = (recorded_entry or {}).get("serial_state") or app_state.get("serial_state") or {}
    return order_info, serial_state


ORDER_SWITCH_REQUIRES_SERIAL_SECONDS = 5.0


def _get_total_scanned_serials(serial_state: dict | None) -> int:
    if not isinstance(serial_state, dict):
        return 0
    total = 0
    for state in serial_state.values():
        scanned = (state or {}).get("scanned_serials") or set()
        try:
            total += len(scanned)
        except Exception:
            pass
    return total


def _handle_order_code(code: str, should_auto_record: bool, is_recording: bool) -> str:
    """
    Xử lý khi phát hiện mã đơn từ camera/scanner.

    Luồng vận hành hiện tại:
    - Quét order mới khi đang rảnh: set order hiện tại rồi auto quay.
    - Quét lại đúng order đang quay: kết thúc quay.
    - Quét order mới khi đang quay: kết thúc video cũ rồi chuyển sang quay order mới.
    - Trả về "ok" | "stop" | "serial-required" | "packing-incomplete" | "fail".
    """
    with state_lock:
        current_order_code = normalize_scanned_code(app_state.get("current_order_code") or "")
        recording_order_code = normalize_scanned_code(app_state.get("recording_order_code") or "")
        recording_start = app_state.get("recording_start")
        current_serial_state = app_state.get("serial_state") or {}

    # Đang quay và quét lại đúng order hiện tại:
    # - Nếu vừa bắt đầu quay và chưa quét serial nào: không dừng ngay, tránh camera đọc lặp QR liên tục.
    # - Sau khi đã có ít nhất 1 serial hoặc đã quá thời gian chống lặp: cho phép kết thúc quay.
    if is_recording and code and code == recording_order_code:
        elapsed = max(0.0, time.time() - float(recording_start or time.time()))
        scanned_serial_count = _get_total_scanned_serials(current_serial_state)
        if elapsed <= ORDER_SWITCH_REQUIRES_SERIAL_SECONDS and scanned_serial_count <= 0:
            with state_lock:
                _push_notification(
                    f"⚠️ Đã quét lại mã đơn quá nhanh ({elapsed:.1f}s). Hãy quét ít nhất 1 serial cho đơn {recording_order_code} trước khi kết thúc quay.",
                    "warning",
                )
            return "serial-required"

        order_info, serial_state_for_stop = _get_active_recording_packing_context()
        blocked, block_msg, _ = _packing_blocks_stop(order_info, serial_state_for_stop)
        if blocked:
            with state_lock:
                _push_notification(f"⚠️ {block_msg}", "warning")
            return "packing-incomplete"

        with state_lock:
            _push_notification(f"⏹️ Đã nhận lại mã đơn để kết thúc quay: {code}", "info")

        def _stop_by_rescan():
            try:
                _stop_recording_internal(advance_after_stop=True)
            except Exception as e:
                print(f"[ORDER] Loi khi ket thuc quay bang quet lai ma don {code}: {e}")

        threading.Thread(target=_stop_by_rescan, daemon=True).start()
        return "stop"

    # Đang quay và quét sang order mới quá sớm khi chưa có serial nào => chặn chuyển đơn.
    if (
        is_recording
        and code
        and recording_order_code
        and code != recording_order_code
        and recording_start
    ):
        elapsed = max(0.0, time.time() - float(recording_start))
        scanned_serial_count = _get_total_scanned_serials(current_serial_state)
        if elapsed <= ORDER_SWITCH_REQUIRES_SERIAL_SECONDS and scanned_serial_count <= 0:
            with state_lock:
                _push_notification(
                    f"⚠️ Vừa quét mã đơn mới quá nhanh ({elapsed:.1f}s). Hãy quét ít nhất 1 serial cho đơn {recording_order_code} trước khi chuyển đơn.",
                    "warning",
                )
            return "serial-required"

    try:
        if order_service.get_order_platform() == "generic":
            order_info = order_service.build_local_order(code)
            print(f"[ORDER] Chế độ generic: dùng mã đơn cục bộ, không gọi TikTok API ({code})")
        else:
            order_info = order_service.get_order(code)
    except Exception as e:
        print(f"[ORDER] Loi khi doc thong tin don cho QR '{code}': {e}")
        with state_lock:
            _push_notification(f"❌ Không lấy được thông tin đơn: {code}", "error")
        return "fail"

    # Không tìm thấy đơn
    if not order_info:
        with state_lock:
            _push_notification(f"❌ Không tìm thấy đơn: {code}", "error")
        return "fail"

    serial_state = _init_serial_state_for_order(order_info)
    evaluation = _evaluate_packing_state(order_info, serial_state)

    became_current = False
    should_rollover_recording = False
    with state_lock:
        import uuid

        entry = {
            "id": str(uuid.uuid4()),
            "order_code": code,
            "order_info": order_info,
            "serial_state": serial_state,
            "packing_evaluation": evaluation,
            "created_at": time.time(),
        }
        current_order_code = normalize_scanned_code(app_state.get("current_order_code") or "")
        recording_order_code = normalize_scanned_code(app_state.get("recording_order_code") or "")
        became_current = True
        should_rollover_recording = bool(
            should_auto_record
            and is_recording
            and recording_order_code
            and recording_order_code != code
        )
        should_set_current_now = not should_rollover_recording
        if should_set_current_now:
            _set_single_active_order(entry)
        _push_notification(
            f"✅ Đã nhận mã đơn: {code}" if should_set_current_now else f"✅ Đã nhận mã đơn mới, chuẩn bị chuyển phiên: {code}",
            "info",
        )
        app_state["order_audio_nonce"] = int(app_state.get("order_audio_nonce") or 0) + 1

    # Tự động bắt đầu quay khi:
    # - đơn hợp lệ (API OK, đơn mới trở thành current)
    # - được bật config và hiện chưa quay
    if should_auto_record and (not is_recording) and became_current:
        print(f"[AUTO-RECORD] Nhan ma '{code}', tu dong bat dau quay video...")

        def _auto_start():
            # Giảm tối đa độ trễ auto quay; chỉ nhường rất ngắn cho state/UI cập nhật.
            time.sleep(0.05)
            try:
                _trigger_auto_recording(code)
            except Exception as e:
                print(f"[AUTO-RECORD] Loi: {e}")

        threading.Thread(target=_auto_start, daemon=True).start()
    elif should_rollover_recording and became_current:
        print(f"[AUTO-RECORD] Nhan don moi '{code}' trong luc dang quay, ket thuc don cu va chuyen sang don moi...")

        def _rollover_recording():
            try:
                stop_result = _stop_recording_internal(advance_after_stop=False)
                if not stop_result.get("ok"):
                    print(f"[AUTO-RECORD] Khong the ket thuc don cu khi rollover: {stop_result}")
                    return
                with state_lock:
                    _set_single_active_order(entry)
                time.sleep(0.08)
                _trigger_auto_recording(code)
            except Exception as e:
                print(f"[AUTO-RECORD] Loi rollover: {e}")

        threading.Thread(target=_rollover_recording, daemon=True).start()
    elif (not is_recording) and current_order_code == code and should_auto_record:
        print(f"[AUTO-RECORD] Quet lai ma don '{code}' khi dang ranh, bat dau quay lai...")

        def _auto_restart_same_order():
            time.sleep(0.05)
            try:
                _trigger_auto_recording(code)
            except Exception as e:
                print(f"[AUTO-RECORD] Loi khi quay lai cung ma don {code}: {e}")

        threading.Thread(target=_auto_restart_same_order, daemon=True).start()

    return "ok"


def _handle_serial_code(
    code: str,
    should_auto_record_serial: bool,
    is_recording: bool,
    emit_notification: bool = True,
) -> tuple[str, str]:
    """
    Xử lý khi phát hiện mã serial trong quá trình đóng gói.

    Luồng mới:
    - Serial không hợp lệ => báo lỗi và yêu cầu quét lại.
    - Serial đã có trong đơn => không thêm lại, báo đã có.
    - Đã quét đủ số lượng serial yêu cầu => không nhận thêm, báo đã quét đủ.
    - Serial hợp lệ và còn thiếu => thêm vào bucket "__all__", cập nhật trạng thái.
    """
    code = normalize_scanned_code(code)
    with state_lock:
        order_code = app_state.get("current_order_code")
        order_info = app_state.get("current_order_info")
        order_id = app_state.get("current_order_id")
        serial_state = app_state.get("serial_state") or {}

    if not is_valid_serial(code):
        if emit_notification:
            with state_lock:
                _push_notification("⚠️ Quét lỗi: serial không hợp lệ. Vui lòng quét lại.", "warning")
        return ("invalid", code)

    if not order_code or not order_info:
        print(f"[SERIAL] Bo qua serial '{code}' vi chua co don hien tai.")
        if emit_notification:
            with state_lock:
                _push_notification("⚠️ Chưa có đơn hiện tại. Vui lòng quét QR/mã đơn trước, sau đó quét lại serial.", "warning")
        return ("no-order", code)

    if "__all__" not in serial_state:
        # Nếu vì lý do nào đó serial_state chưa được init (ví dụ crash trước đó),
        # khởi tạo lại từ order_info để tránh KeyError.
        serial_state = _init_serial_state_for_order(order_info)

    bucket = serial_state.get("__all__")
    if bucket is None:
        bucket = {"required_qty": 0, "scanned_serials": set()}
        serial_state["__all__"] = bucket

    required_qty = int(bucket.get("required_qty", 0) or 0)

    scanned_serials = bucket.get("scanned_serials")
    if not isinstance(scanned_serials, set):
        scanned_serials = set(scanned_serials or [])
        bucket["scanned_serials"] = scanned_serials

    scanned_count = len(scanned_serials)

    # 1. Quét trùng: có rồi thì không thêm lại.
    if code in scanned_serials:
        if emit_notification:
            with state_lock:
                _push_notification(f"ℹ️ Serial đã có trong đơn này: {code}", "info")
        return ("duplicate", code)

    # 2. Đã đủ số lượng serial yêu cầu: không cho thêm serial mới nữa.
    if required_qty > 0 and scanned_count >= required_qty:
        if emit_notification:
            with state_lock:
                _push_notification(
                    f"✅ Đơn {order_code} đã quét đủ serial ({scanned_count}/{required_qty}). Không cần quét thêm.",
                    "warning",
                )
        return ("full", code)

    # Nếu không xác định được số lượng cần quét thì không nên nhận serial bừa.
    if required_qty <= 0:
        if emit_notification:
            with state_lock:
                _push_notification("⚠️ Quét lỗi: không xác định được số lượng serial cần quét cho đơn này. Vui lòng kiểm tra lại đơn.", "warning")
        return ("invalid", code)

    # 3. Còn thiếu serial: thêm serial mới.
    scanned_serials.add(code)

    evaluation = _evaluate_packing_state(order_info, serial_state)

    with state_lock:
        # Mirror vào app_state hiện tại
        app_state["serial_state"] = serial_state
        app_state["packing_evaluation"] = evaluation
        # Cập nhật entry trong queue (nếu có)
        entry = _queue_find_entry_by_id(order_id)
        if entry:
            entry["serial_state"] = serial_state
            entry["packing_evaluation"] = evaluation
        _push_recent_serial_event(order_id, order_code, code)

        new_scanned_count = len(scanned_serials)
        if emit_notification:
            if new_scanned_count >= required_qty:
                _push_notification(
                    f"✅ Đã quét đủ serial cho đơn {order_code}: {new_scanned_count}/{required_qty}",
                    "info",
                )
            else:
                _push_notification(
                    f"✅ Đã quét serial: {code} ({new_scanned_count}/{required_qty})",
                    "info",
                )

        # Auto-start quay khi serial hợp lệ
        if should_auto_record_serial and (not is_recording) and is_valid_serial(code):
            if emit_notification:
                _push_notification(f"🎥 Serial hợp lệ, bắt đầu quay: {order_code}", "info")
            def _auto_start_by_serial():
                time.sleep(0.2)
                try:
                    _trigger_auto_recording(order_code)
                except Exception as e:
                    print(f"[AUTO-RECORD SERIAL] Loi: {e}")
                    if emit_notification:
                        with state_lock:
                            _push_notification("❌ Không thể bắt đầu quay tự động", "error")
            threading.Thread(target=_auto_start_by_serial, daemon=True).start()

    print(f"[SERIAL] Quet serial '{code}' cho don '{order_code}'. State: {evaluation}")
    return ("ok", code)


def _handle_dashboard_serial_scan(code: str, emit_notifications: bool = True) -> tuple[bool, str, str]:
    """
    Dashboard scanner theo luồng 2 pha:
    1) Khi chưa có đơn/không quay: mã đầu tiên quét được được coi là mã đơn, không cần rule 57/58/SPX.
    2) Khi đã có đơn và đang quay: các mã khác mã đơn hiện tại được coi là serial.
    3) Khi quét lại đúng mã đơn hiện tại: kết thúc quay, nhưng có chống lặp quá nhanh nếu chưa quét serial.

    Trả về: (ok, kind, message_or_code)
    """
    normalized = normalize_scanned_code(code)
    if not normalized:
        return (False, "unknown", "Mã không hợp lệ")

    with state_lock:
        is_recording = bool(app_state.get("is_recording", False))
        should_auto = bool(app_state.get("auto_record_on_qr", False))
        current_order_code = normalize_scanned_code(app_state.get("current_order_code") or "")
        recording_order_code = normalize_scanned_code(app_state.get("recording_order_code") or "")

    active_order_code = recording_order_code or current_order_code

    # Chưa có đơn đang xử lý: mọi mã đầu tiên đều là mã đơn, không cần rule tiền tố.
    if not active_order_code:
        order_result = _handle_order_code(
            normalized,
            should_auto_record=should_auto,
            is_recording=is_recording,
        )
        if order_result == "ok":
            return (True, "order", normalized)
        if order_result == "stop":
            return (True, "order-stop", normalized)
        return (False, "order", f"Không xử lý được mã đơn: {normalized}")

    # Đang có đơn: chỉ mã trùng đúng order hiện tại mới được coi là QR/order để dừng quay.
    if normalized == active_order_code:
        order_result = _handle_order_code(
            normalized,
            should_auto_record=should_auto,
            is_recording=is_recording,
        )
        if order_result == "stop":
            return (True, "order-stop", normalized)
        if order_result == "ok":
            return (True, "order", normalized)
        if order_result == "serial-required":
            return (
                False,
                "order",
                "Đã quét lại mã đơn quá nhanh. Hãy quét ít nhất 1 serial cho đơn hiện tại trước khi kết thúc quay.",
            )
        if order_result == "packing-incomplete":
            _, block_msg, _ = _packing_blocks_stop(*_get_active_recording_packing_context())
            return (
                False,
                "order",
                block_msg or "Chưa quét đủ serial. Vui lòng quét đủ sản phẩm trước khi kết thúc quay.",
            )
        return (False, "order", f"Không xử lý được mã đơn: {normalized}")

    # Đang có đơn mà mã khác mã đơn hiện tại: coi là serial, không gọi API đơn hàng nữa.
    if not is_valid_serial(normalized):
        return (False, "serial", "Serial không hợp lệ")

    status, serial_code = _handle_serial_code(
        normalized,
        should_auto_record_serial=False,
        is_recording=is_recording,
        emit_notification=emit_notifications,
    )
    if status == "ok":
        return (True, "serial", serial_code)
    if status == "duplicate":
        return (False, "serial", f"Serial đã có trong đơn này: {serial_code}")
    if status == "full":
        return (False, "serial", "Đơn này đã quét đủ serial. Không cần quét thêm.")
    if status == "no-order":
        return (False, "serial", "Chưa có mã đơn hiện tại. Vui lòng quét QR/mã đơn trước rồi quét lại serial.")
    return (False, "serial", "Quét lỗi: serial không hợp lệ. Vui lòng quét lại.")

def build_managers_and_scanners(
    configs,
    scan_interval_sec=0.05,
    sensitivity=SENSITIVITY_NORMAL,
    qr_cooldown_seconds: int = 5,
    recording_camera_slot: int | None = None,
):
    """Dừng toàn bộ camera/scanner cũ, tạo mới theo configs. Recorder gắn vào camera được chọn để quay."""
    global camera_managers, ai_scanners
    for m in camera_managers:
        try:
            m.stop()
        except Exception:
            pass
    camera_managers.clear()
    ai_scanners.clear()
    if not configs:
        configs = [_default_camera_config()]
    for cfg in configs:
        mgr = CameraManager(
            camera_index=cfg.get("camera_index", 0),
            width=cfg.get("width", CameraManager.DEFAULT_WIDTH),
            height=cfg.get("height", CameraManager.DEFAULT_HEIGHT),
            fps=cfg.get("fps", CameraManager.DEFAULT_FPS),
            source_type=cfg.get("source_type", SOURCE_USB),
            rtsp_url=cfg.get("rtsp_url", "") or "",
        )
        camera_managers.append(mgr)
        sc = AIBarcodeScanner(
            camera_manager=mgr,
            on_code_detected=on_code_detected,
            scan_interval_sec=scan_interval_sec,
            sensitivity=sensitivity,
            cooldown_seconds=qr_cooldown_seconds,
        )
        ai_scanners.append(sc)
    if camera_managers:
        normalized_slot = _normalize_recording_camera_slot(recording_camera_slot, configs)
        recorder_idx = 0
        for idx, cfg in enumerate(configs):
            try:
                slot_index = int(cfg.get("slot_index", idx))
            except (TypeError, ValueError):
                slot_index = idx
            if slot_index == normalized_slot:
                recorder_idx = idx
                break
        camera_managers[recorder_idx].set_recorder(recorder)
    _ensure_primary_references()
    # Khởi động luồng đọc frame và quét mã (nếu không gọi start() sẽ không có hình)
    for m in camera_managers:
        try:
            m.start()
        except RuntimeError:
            pass
    for sc in ai_scanners:
        sc.start()


def _ensure_primary_references():
    global _primary_camera_manager, _primary_ai_scanner
    _primary_camera_manager = camera_managers[0] if camera_managers else None
    _primary_ai_scanner = ai_scanners[0] if ai_scanners else None


_primary_camera_manager = None
_primary_ai_scanner = None

# Camera status tracking
camera_status = {
    "initialized": False,
    "running": False,
    "error": None,
    "last_test": None
}
camera_status_lock = threading.Lock()

# KHÔNG TỰ ĐỘNG KHỞI ĐỘNG CAMERA KHI APP START
# User sẽ test và start manual từ dashboard


@app.context_processor
def inject_globals():
    with state_lock:
        return {
            "current_order_code": app_state["current_order_code"],
            "current_order_info": app_state["current_order_info"],
            "is_recording": app_state["is_recording"],
            "app_version": APP_VERSION,
            "update_enabled": _update_enabled(),
        }


def _client_ip() -> str:
    forwarded = (request.headers.get("X-Forwarded-For") or "").split(",")[0].strip()
    return forwarded or (request.remote_addr or "unknown")


def _login_tracker_key(username: str) -> str:
    return f"{(username or '').strip().lower()}|{_client_ip()}"


def _get_login_tracker(key: str) -> dict[str, float | int]:
    now = time.time()
    item = login_fail_tracker.get(key)
    if not item:
        item = {"fails": 0, "locked_until": 0.0}
        login_fail_tracker[key] = item
        return item
    locked_until = float(item.get("locked_until") or 0.0)
    if locked_until and now > locked_until:
        item["fails"] = 0
        item["locked_until"] = 0.0
    return item


def _is_login_locked(key: str) -> bool:
    item = _get_login_tracker(key)
    return float(item.get("locked_until") or 0.0) > time.time()


def _record_login_failed(key: str) -> dict[str, float | int]:
    item = _get_login_tracker(key)
    fails = int(item.get("fails") or 0) + 1
    item["fails"] = fails
    if fails >= LOGIN_FAIL_THRESHOLD:
        item["locked_until"] = time.time() + LOGIN_LOCK_SECONDS
    return item


def _reset_login_tracker(key: str) -> None:
    login_fail_tracker.pop(key, None)
    session.pop("login_captcha_answer", None)
    session.pop("login_captcha_question", None)


def _ensure_login_captcha(force_new: bool = False) -> None:
    if force_new or "login_captcha_question" not in session or "login_captcha_answer" not in session:
        a = secrets.randbelow(8) + 2
        b = secrets.randbelow(8) + 2
        session["login_captcha_question"] = f"{a} + {b} = ?"
        session["login_captcha_answer"] = str(a + b)


def _validate_login_captcha(user_answer: str) -> bool:
    expect = str(session.get("login_captcha_answer") or "").strip()
    return expect and str(user_answer or "").strip() == expect


def _password_policy_errors(password: str) -> list[str]:
    out: list[str] = []
    pwd = password or ""
    if len(pwd) < 8:
        out.append("Mật khẩu phải có ít nhất 8 ký tự.")
    if not re.search(r"[A-Z]", pwd):
        out.append("Mật khẩu phải có ít nhất 1 chữ hoa.")
    if not re.search(r"[0-9]", pwd):
        out.append("Mật khẩu phải có ít nhất 1 chữ số.")
    if not re.search(r"[^A-Za-z0-9]", pwd):
        out.append("Mật khẩu phải có ít nhất 1 ký tự đặc biệt.")
    return out


def _reset_token_serializer() -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(
        secret_key=app.secret_key,
        salt=(os.environ.get("ECOHUB_RESET_PASSWORD_SALT") or "ecohub-reset-password").strip(),
    )


def _build_reset_password_url(token: str) -> str:
    env_base = (os.environ.get("ECOHUB_APP_BASE_URL") or "").strip().rstrip("/")
    if env_base:
        return f"{env_base}{url_for('reset_password', token=token)}"
    return url_for("reset_password", token=token, _external=True)


def _send_reset_password_email(to_email: str, username: str, reset_url: str) -> None:
    host = (os.environ.get("ECOHUB_SMTP_HOST") or "").strip()
    user = (os.environ.get("ECOHUB_SMTP_USER") or "").strip()
    pwd = (os.environ.get("ECOHUB_SMTP_PASSWORD") or "").strip()
    sender_email = (os.environ.get("ECOHUB_SMTP_FROM_EMAIL") or user).strip()
    sender_name = (os.environ.get("ECOHUB_SMTP_FROM_NAME") or "EcoHub").strip()
    if not host or not sender_email:
        raise RuntimeError("Thiếu cấu hình SMTP (host/from email).")

    try:
        port = int((os.environ.get("ECOHUB_SMTP_PORT") or "587").strip())
    except Exception:
        port = 587
    use_tls = (os.environ.get("ECOHUB_SMTP_USE_TLS") or "1").strip().lower() in {"1", "true", "yes", "on"}

    body = (
        f"Xin chào {username},\n\n"
        "Bạn vừa yêu cầu đặt lại mật khẩu EcoHub.\n"
        f"Nhấn link sau để đặt lại mật khẩu:\n{reset_url}\n\n"
        "Link có hiệu lực trong 30 phút.\n"
        "Nếu bạn không yêu cầu, hãy bỏ qua email này.\n"
    )
    msg = MIMEText(body, "plain", "utf-8")
    msg["Subject"] = "EcoHub - Dat lai mat khau"
    msg["From"] = formataddr((sender_name, sender_email))
    msg["To"] = to_email

    server: smtplib.SMTP | None = None
    try:
        server = smtplib.SMTP(host, port, timeout=20)
        if use_tls:
            server.starttls()
        if user and pwd:
            server.login(user, pwd)
        server.sendmail(sender_email, [to_email], msg.as_string())
    finally:
        if server is not None:
            try:
                server.quit()
            except Exception:
                pass


# ==========
# ROUTES
# ==========


@app.route("/", methods=["GET", "POST"])
def login():
    """
    Đăng nhập bằng tài khoản lưu trong DB nội bộ.
    """
    show_captcha = False
    if request.method == "POST":
        username = (request.form.get("username") or "").strip()
        password = (request.form.get("password") or "").strip()
        remember_me = (request.form.get("remember_me") or "").strip().lower() in {"1", "on", "true", "yes"}
        tracker_key = _login_tracker_key(username)
        tracker = _get_login_tracker(tracker_key)

        if _is_login_locked(tracker_key):
            flash(
                f"❌ Tài khoản tạm khóa do nhập sai nhiều lần. Thử lại sau {LOGIN_LOCK_MINUTES} phút.",
                "error",
            )
            _ensure_login_captcha(force_new=True)
            show_captcha = True
            return render_template("login.html", show_captcha=show_captcha, enable_email_reset=ENABLE_EMAIL_RESET)

        show_captcha = int(tracker.get("fails") or 0) >= LOGIN_CAPTCHA_AFTER_FAILS
        if show_captcha:
            if not _validate_login_captcha(request.form.get("captcha_answer") or ""):
                flash("❌ CAPTCHA không chính xác.", "error")
                _record_login_failed(tracker_key)
                _ensure_login_captcha(force_new=True)
                return render_template("login.html", show_captcha=True, enable_email_reset=ENABLE_EMAIL_RESET)

        user = get_user_by_username(USER_AUTH_DB, username)
        if not user or not user.is_active or not check_password_hash(user.password_hash, password):
            tracker = _record_login_failed(tracker_key)
            flash("❌ Tên đăng nhập hoặc mật khẩu không chính xác.", "error")
            show_captcha = int(tracker.get("fails") or 0) >= LOGIN_CAPTCHA_AFTER_FAILS
            if show_captcha:
                _ensure_login_captcha(force_new=True)
            return render_template("login.html", show_captcha=show_captcha, enable_email_reset=ENABLE_EMAIL_RESET)

        session["user"] = {"username": user.username, "role": user.role}
        session.permanent = remember_me
        _reset_login_tracker(tracker_key)
        return redirect(url_for("dashboard"))

    if session.get("login_captcha_answer") and session.get("login_captcha_question"):
        show_captcha = True
    return render_template("login.html", show_captcha=show_captcha, enable_email_reset=ENABLE_EMAIL_RESET)


@app.route("/logout", methods=["POST"])
def logout():
    session.clear()
    flash("✅ Đã đăng xuất.")
    return redirect(url_for("login"))


def _is_admin_user() -> bool:
    user = session.get("user") or {}
    return str(user.get("role") or "").lower() == "admin"


@app.route("/register", methods=["GET", "POST"])
def register():
    """
    Tạo tài khoản vận hành mới.
    - Nếu chưa có user nào: tài khoản đầu tiên sẽ là admin.
    - Các tài khoản tiếp theo mặc định là operator.
    """
    if request.method == "POST":
        full_name = (request.form.get("full_name") or "").strip()
        contact = (request.form.get("contact") or "").strip()
        username = (request.form.get("username") or "").strip()
        password = (request.form.get("password") or "").strip()
        password_confirm = (request.form.get("password_confirm") or "").strip()

        if not full_name:
            flash("❌ Vui lòng nhập họ và tên.", "error")
            return render_template("register.html")
        if not contact:
            flash("❌ Vui lòng nhập email liên hệ.", "error")
            return render_template("register.html")
        if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", contact):
            flash("❌ Email liên hệ không hợp lệ.", "error")
            return render_template("register.html")
        if not username:
            flash("❌ Vui lòng nhập tên đăng nhập.", "error")
            return render_template("register.html")
        policy_errors = _password_policy_errors(password)
        if policy_errors:
            flash(f"❌ {policy_errors[0]}", "error")
            return render_template("register.html")
        if password != password_confirm:
            flash("❌ Mật khẩu nhập lại không khớp.", "error")
            return render_template("register.html")
        if get_user_by_username(USER_AUTH_DB, username):
            flash("❌ Tên đăng nhập đã tồn tại.", "error")
            return render_template("register.html")

        role = "admin" if count_auth_users(USER_AUTH_DB) == 0 else "operator"
        try:
            create_auth_user(
                USER_AUTH_DB,
                username,
                password,
                role=role,
                full_name=full_name,
                contact=contact,
            )
        except Exception as e:
            flash(f"❌ Không tạo được tài khoản: {e}", "error")
            return render_template("register.html")

        flash("✅ Đăng ký thành công. Vui lòng đăng nhập.")
        return redirect(url_for("login"))

    return render_template("register.html")


@app.route("/forgot-password", methods=["GET", "POST"])
def forgot_password():
    if not ENABLE_EMAIL_RESET:
        flash("⚠️ Chức năng đặt lại mật khẩu qua email đang tắt.", "error")
        return redirect(url_for("login"))
    if request.method == "POST":
        email = (request.form.get("email") or "").strip()
        generic_ok_msg = "✅ Nếu email tồn tại trong hệ thống, link đặt lại mật khẩu đã được gửi."
        if not email:
            flash("❌ Vui lòng nhập email đã đăng ký.", "error")
            return render_template("forgot_password.html")

        user = get_user_by_contact(USER_AUTH_DB, email)
        if not user or not user.is_active:
            flash(generic_ok_msg)
            return redirect(url_for("login"))

        try:
            token = _reset_token_serializer().dumps(
                {"uid": int(user.id), "username": user.username, "purpose": "reset_password"}
            )
            reset_url = _build_reset_password_url(token)
            _send_reset_password_email(email, user.username, reset_url)
        except Exception as e:
            print(f"[AUTH] Send reset email failed: {e}")
            flash("❌ Không gửi được email đặt lại mật khẩu. Vui lòng kiểm tra cấu hình SMTP.", "error")
            return render_template("forgot_password.html")

        flash(generic_ok_msg)
        return redirect(url_for("login"))

    return render_template("forgot_password.html")


@app.route("/reset-password/<token>", methods=["GET", "POST"])
def reset_password(token: str):
    if not ENABLE_EMAIL_RESET:
        flash("⚠️ Chức năng đặt lại mật khẩu qua email đang tắt.", "error")
        return redirect(url_for("login"))
    user = None
    try:
        data = _reset_token_serializer().loads(token, max_age=1800)
        if not isinstance(data, dict) or data.get("purpose") != "reset_password":
            raise BadSignature("Invalid token purpose")
        uid = int(data.get("uid") or 0)
        username = str(data.get("username") or "").strip()
        if uid <= 0 or not username:
            raise BadSignature("Invalid token payload")
        user = get_user_by_username(USER_AUTH_DB, username)
        if not user or int(user.id) != uid or not user.is_active:
            raise BadSignature("User not found")
    except SignatureExpired:
        flash("❌ Link đặt lại mật khẩu đã hết hạn. Vui lòng yêu cầu lại.", "error")
        return redirect(url_for("forgot_password"))
    except Exception:
        flash("❌ Link đặt lại mật khẩu không hợp lệ.", "error")
        return redirect(url_for("forgot_password"))

    if request.method == "POST":
        password = (request.form.get("password") or "").strip()
        password_confirm = (request.form.get("password_confirm") or "").strip()
        policy_errors = _password_policy_errors(password)
        if policy_errors:
            flash(f"❌ {policy_errors[0]}", "error")
            return render_template("reset_password.html", token=token)
        if password != password_confirm:
            flash("❌ Mật khẩu nhập lại không khớp.", "error")
            return render_template("reset_password.html", token=token)
        try:
            update_user_password(USER_AUTH_DB, int(user.id), password)
        except Exception as e:
            flash(f"❌ Không thể cập nhật mật khẩu: {e}", "error")
            return render_template("reset_password.html", token=token)
        flash("✅ Đặt lại mật khẩu thành công. Vui lòng đăng nhập.")
        return redirect(url_for("login"))

    return render_template("reset_password.html", token=token)


@app.route("/dashboard")
def dashboard():
    if "user" not in session:
        return redirect(url_for("login"))

    recording_flow = _get_recording_flow()
    if "recording_flow" not in session:
        session["recording_flow"] = recording_flow
    with state_lock:
        if not app_state.get("is_recording"):
            app_state["recording_flow"] = recording_flow

    with camera_status_lock:
        cam_status = camera_status.copy()
    
    with state_lock:
        order_code = app_state.get("current_order_code")
        order_info = app_state.get("current_order_info")
        packing_state = app_state.get("packing_evaluation")
        serial_state = app_state.get("serial_state") or {}
        is_recording = bool(app_state.get("is_recording"))

    return render_template(
        "dashboard.html",
        num_cameras=len(camera_managers),
        camera_status=cam_status,
        current_order_code=order_code,
        current_order_info=order_info,
        packing_state=packing_state,
        serial_state=serial_state,
        recording_flow=recording_flow,
        recording_flow_label=storage_service.recording_flow_label(recording_flow),
        is_recording=is_recording,
    )


@app.route("/api/update/status", methods=["GET"])
def api_update_status():
    if "user" not in session:
        return jsonify({"ok": False, "error": "Chua dang nhap"}), 401
    try:
        payload = _build_update_status()
        payload["ok"] = True
        return jsonify(payload)
    except Exception as e:
        return jsonify({"ok": False, "error": str(e), "current_version": APP_VERSION}), 500


@app.route("/api/update/download", methods=["POST"])
def api_update_download():
    if "user" not in session:
        return jsonify({"ok": False, "error": "Chua dang nhap"}), 401
    if not _update_enabled():
        return jsonify({"ok": False, "error": "Auto-update chua duoc cau hinh."}), 400
    try:
        manifest = _fetch_update_manifest()
        if not _is_remote_version_newer(manifest["version"], APP_VERSION):
            return jsonify(
                {
                    "ok": True,
                    "message": "Ban dang o ban moi nhat.",
                    "current_version": APP_VERSION,
                    "remote_version": manifest["version"],
                }
            )
        pending = _download_update_package(manifest)
        return jsonify(
            {
                "ok": True,
                "message": f"Da tai xong ban {pending['version']}.",
                "version": pending["version"],
                "downloaded_at": pending["downloaded_at"],
            }
        )
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/update/apply", methods=["POST"])
def api_update_apply():
    if "user" not in session:
        return jsonify({"ok": False, "error": "Chua dang nhap"}), 401
    if not _update_enabled():
        return jsonify({"ok": False, "error": "Auto-update chua duoc cau hinh."}), 400

    pending = _read_pending_update_state()
    zip_path = str(pending.get("zip_path") or "").strip()
    if not zip_path or not os.path.isfile(zip_path):
        return jsonify({"ok": False, "error": "Chua co goi cap nhat da tai."}), 400

    global _shutdown_in_progress
    with state_lock:
        if _shutdown_in_progress:
            return jsonify({"ok": False, "error": "EcoHub dang trong qua trinh tat."}), 409
        _shutdown_in_progress = True

    try:
        _launch_windows_updater(zip_path)
    except Exception as e:
        with state_lock:
            _shutdown_in_progress = False
        return jsonify({"ok": False, "error": str(e)}), 500

    shutdown_server = request.environ.get("werkzeug.server.shutdown")
    threading.Thread(
        target=_deferred_shutdown,
        args=(shutdown_server, 1.0),
        daemon=True,
    ).start()
    return jsonify(
        {
            "ok": True,
            "message": f"Dang ap dung ban {pending.get('version')}. EcoHub se tu dong mo lai sau khi cap nhat.",
        }
    )


@app.route("/api/recording_flow", methods=["GET", "POST"])
def api_recording_flow():
    """Đọc/ghi chế độ quay: hàng gửi (outbound) hoặc hàng hoàn (return)."""
    if "user" not in session:
        return jsonify({"ok": False, "error": "Chưa đăng nhập"}), 401

    if request.method == "GET":
        flow = _get_recording_flow()
        with state_lock:
            locked = bool(app_state.get("is_recording"))
        return jsonify(
            {
                "ok": True,
                "recording_flow": flow,
                "label": storage_service.recording_flow_label(flow),
                "locked": locked,
            }
        )

    payload = request.get_json(silent=True) or {}
    raw_flow = payload.get("recording_flow")
    if raw_flow is None:
        raw_flow = request.form.get("recording_flow")
    flow, err = _set_recording_flow(str(raw_flow or ""))
    if err:
        return jsonify({"ok": False, "error": err, "recording_flow": flow}), 409
    return jsonify(
        {
            "ok": True,
            "recording_flow": flow,
            "label": storage_service.recording_flow_label(flow),
        }
    )


@app.route("/orders")
def orders_page():
    """
    Trang quản lý đơn hàng hiện tại:
    - Hiển thị mã đơn đang được quét.
    - Thông tin chi tiết đơn (items).
    - Trạng thái đóng gói (packing_evaluation).
    - Danh sách serial đã quét (theo bucket).
    """
    if "user" not in session:
        return redirect(url_for("login"))

    with state_lock:
        order_code = app_state.get("current_order_code")
        order_id = app_state.get("current_order_id")
        order_info = app_state.get("current_order_info")
        packing_state = app_state.get("packing_evaluation")
        serial_state = app_state.get("serial_state") or {}
        order_queue = list(app_state.get("order_queue") or [])

    # Chuyển serial_state thành dạng dễ render
    serial_summary = []
    if isinstance(serial_state, dict):
        for key, bucket in serial_state.items():
            scanned = bucket.get("scanned_serials") or []
            # Nếu là set thì convert sang list để render
            if isinstance(scanned, set):
                scanned_list = sorted(list(scanned))
            else:
                scanned_list = list(scanned)
            serial_summary.append(
                {
                    "key": key,
                    "required_qty": bucket.get("required_qty", 0),
                    "scanned_serials": scanned_list,
                    "scanned_count": len(scanned_list),
                }
            )

    return render_template(
        "orders.html",
        current_order_id=order_id,
        current_order_code=order_code,
        current_order_info=order_info,
        packing_state=packing_state,
        serial_summary=serial_summary,
        order_queue=order_queue,
    )


@app.route("/orders/select", methods=["POST"])
def orders_select():
    """Chọn đơn đang xử lý từ hàng chờ."""
    if "user" not in session:
        return redirect(url_for("login"))
    order_id = (request.form.get("order_id") or "").strip()
    with state_lock:
        if _queue_find_entry_by_id(order_id):
            _queue_set_current(order_id)
            app_state["order_audio_nonce"] = int(app_state.get("order_audio_nonce") or 0) + 1
            flash("✅ Đã chuyển sang đơn được chọn")
        else:
            flash("❌ Không tìm thấy đơn trong hàng chờ", "error")
    return redirect(url_for("orders_page"))


@app.route("/orders/delete", methods=["POST"])
def orders_delete():
    """Xóa một đơn khỏi hàng chờ (khi quét nhầm/không hợp lệ)."""
    if "user" not in session:
        return redirect(url_for("login"))
    order_id = (request.form.get("order_id") or "").strip()
    with state_lock:
        q = app_state.get("order_queue") or []
        before = len(q)
        app_state["order_queue"] = [e for e in q if (e or {}).get("id") != order_id]
        after = len(app_state["order_queue"])
        if before == after:
            flash("❌ Không tìm thấy đơn để xóa", "error")
        else:
            # Nếu đang xóa đơn hiện tại thì advance
            if app_state.get("current_order_id") == order_id:
                _queue_advance_to_next()
            flash("🗑️ Đã xóa đơn khỏi hàng chờ")
    return redirect(url_for("orders_page"))


@app.route("/manual-scan", methods=["POST"])
def manual_scan():
    """
    Nhận serial từ đầu đọc (scanner hoạt động như keyboard) trên Dashboard.
    """
    if "user" not in session:
        return redirect(url_for("login"))

    raw_code = (request.form.get("code") or "").strip()
    if not raw_code:
        flash("Không có mã để quét.")
        return redirect(url_for("dashboard"))

    try:
        ok, kind, result = _handle_dashboard_serial_scan(raw_code, emit_notifications=False)
        if not ok:
            flash(f"❌ {result}", "error")
        else:
            if kind == "order":
                flash(f"✅ Đã nhận mã đơn: {result}")
            elif kind == "order-stop":
                flash(f"⏹️ Đã nhận lại mã đơn để kết thúc quay: {result}")
            else:
                flash(f"Đã quét serial: {result}")
    except Exception as e:
        flash(f"Lỗi khi xử lý mã: {e}")

    return redirect(url_for("dashboard"))


@app.route("/manual-scan-api", methods=["POST"])
def manual_scan_api():
    """
    API cho scanner serial trên Dashboard (AJAX) để tránh full page reload.
    """
    if "user" not in session:
        return jsonify({"ok": False, "error": "Chưa đăng nhập"}), 401

    raw_code = (request.form.get("code") or "").strip()

    try:
        ok, kind, result = _handle_dashboard_serial_scan(raw_code)
        if not ok:
            return jsonify({"ok": False, "error": result, "kind": kind}), 400
        action = "stop" if kind == "order-stop" else "scan"
        return jsonify({"ok": True, "code": result, "kind": kind, "action": action})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/manual-order", methods=["POST"])
def manual_order_create():
    """
    Tạo đơn thủ công khi không có camera/scanner.
    Luồng hiện tại chỉ giữ 1 order đang xử lý.
    Quét/nhập lại đúng order đang quay sẽ kết thúc quay.
    """
    is_ajax = (request.headers.get("X-Requested-With") or "").lower() == "xmlhttprequest"

    def _error_response(message: str, status_code: int = 400):
        if is_ajax:
            return jsonify({"ok": False, "error": message}), status_code
        flash(f"❌ {message}")
        return redirect(url_for("dashboard"))

    if "user" not in session:
        if is_ajax:
            return jsonify({"ok": False, "error": "Phiên đăng nhập hết hạn"}), 401
        return redirect(url_for("login"))

    order_code = normalize_scanned_code((request.form.get("order_code") or "").strip())
    if not order_code:
        return _error_response("Vui lòng nhập mã đơn.")
    with state_lock:
        is_recording = bool(app_state.get("is_recording", False))
        should_auto = bool(app_state.get("auto_record_on_qr", False))

    result = _handle_order_code(order_code, should_auto_record=should_auto, is_recording=is_recording)
    if result == "ok":
        success_message = f"Đã nhận mã đơn: {order_code}"
        if is_ajax:
            return jsonify({"ok": True, "message": success_message, "order_code": order_code, "action": "scan"})
        flash(f"✅ {success_message}")
        return redirect(url_for("dashboard"))

    if result == "stop":
        msg = f"Đã nhận lại mã đơn để kết thúc quay: {order_code}"
        if is_ajax:
            return jsonify({"ok": True, "message": msg, "order_code": order_code, "action": "stop"}), 200
        flash(f"⏹️ {msg}", "info")
        return redirect(url_for("dashboard"))

    if result == "serial-required":
        msg = "Vừa quét mã đơn mới quá nhanh. Hãy quét ít nhất 1 serial cho đơn hiện tại trước khi chuyển đơn."
        if is_ajax:
            return jsonify({"ok": False, "error": msg}), 400
        flash(f"⚠️ {msg}", "warning")
        return redirect(url_for("dashboard"))

    if result == "packing-incomplete":
        _, block_msg, packing_state = _packing_blocks_stop(*_get_active_recording_packing_context())
        msg = block_msg or "Chưa quét đủ serial. Vui lòng quét đủ sản phẩm trước khi kết thúc quay."
        if is_ajax:
            return jsonify({"ok": False, "error": msg, "packing_state": packing_state}), 400
        flash(f"⚠️ {msg}", "warning")
        return redirect(url_for("dashboard"))

    return _error_response("Không lấy được thông tin đơn.")

    with state_lock:
        if _queue_find_entry_by_code(order_code):
            msg = f"Mã đơn {order_code} đã có trong hàng chờ — không thêm lại."
            _push_notification(msg, "info")
            if is_ajax:
                return jsonify({"ok": False, "error": msg, "duplicate": True}), 200
            flash(f"ℹ️ {msg}", "info")
            return redirect(url_for("dashboard"))

    order_info = None
    try:
        if order_service.get_order_platform() == "generic":
            order_info = order_service.build_local_order(order_code)
        else:
            order_info = order_service.get_order(order_code)
    except Exception as e:
        err_text = str(e)
        if "105002" in err_text or "Expired credentials" in err_text or "access_token" in err_text.lower():
            message = "Token TikTok đã hết hạn. Vui lòng vào tab TikTok Ủy quyền để kết nối lại shop."
        else:
            message = f"Lỗi gọi API đơn hàng: {e}"
        if is_ajax:
            return jsonify({"ok": False, "error": message}), 400
        flash(f"❌ {message}", "error")
        return redirect(url_for("dashboard"))

    if not order_info:
        return _error_response("Không tạo được thông tin đơn.")

    # Chỉ dùng dữ liệu API thật, không fallback mock.
    if not isinstance(order_info.get("items"), list):
        order_info["items"] = []
    if "code" not in order_info:
        order_info["code"] = order_code
    if "platform" not in order_info:
        order_info["platform"] = "TIKTOK_SHOP"
    if "status" not in order_info:
        order_info["status"] = "ACTIVE"
    if "shipping_status" not in order_info:
        order_info["shipping_status"] = ""

    serial_state = _init_serial_state_for_order(order_info)
    evaluation = _evaluate_packing_state(order_info, serial_state)

    with state_lock:
        import uuid

        entry = {
            "id": str(uuid.uuid4()),
            "order_code": order_code,
            "order_info": order_info,
            "serial_state": serial_state,
            "packing_evaluation": evaluation,
            "created_at": time.time(),
        }
        q = app_state.get("order_queue")
        if not isinstance(q, list):
            q = []
            app_state["order_queue"] = q
        q.insert(0, entry)
        _queue_set_current(entry["id"])
        _push_notification(f"✅ Đã tạo đơn thủ công (ưu tiên): {order_code}", "info")
        app_state["order_audio_nonce"] = int(app_state.get("order_audio_nonce") or 0) + 1

    success_message = f"Đã tạo đơn thủ công: {order_code}"
    if is_ajax:
        return jsonify({"ok": True, "message": success_message, "order_code": order_code})
    flash(f"✅ {success_message}")
    return redirect(url_for("dashboard"))


def _build_tiktok_authorize_url(state: str) -> str:
    service_id = (os.environ.get("ECOHUB_TIKTOK_SERVICE_ID") or "").strip()
    if not service_id:
        raise RuntimeError("Thiếu ECOHUB_TIKTOK_SERVICE_ID")
    auth_base = (os.environ.get("ECOHUB_TIKTOK_AUTH_BASE_URL") or "").strip() or "https://services.tiktokshop.com/open/authorize"
    redirect_uri = _get_tiktok_redirect_uri()
    return f"{auth_base}?{urlencode({'service_id': service_id, 'state': state, 'redirect_uri': redirect_uri})}"


def _get_tiktok_redirect_uri() -> str:
    """
    Ưu tiên giữ cùng host người dùng đang mở app để tránh mất session
    giữa localhost và 127.0.0.1 khi TikTok callback quay về.
    """
    env_redirect_uri = (os.environ.get("ECOHUB_TIKTOK_REDIRECT_URI") or "").strip()
    req_host = (request.host or "").strip().lower()
    if req_host:
        dynamic_redirect_uri = url_for("tiktok_auth_callback", _external=True)
        if not env_redirect_uri:
            return dynamic_redirect_uri
        local_aliases = ("localhost", "127.0.0.1")
        if any(alias in env_redirect_uri.lower() for alias in local_aliases) and any(alias in req_host for alias in local_aliases):
            return dynamic_redirect_uri
    return env_redirect_uri or url_for("tiktok_auth_callback", _external=True)


def _exchange_tiktok_merchant_token(merchant_id: str, refresh_token: str = "") -> dict:
    client_key = (os.environ.get("ECOHUB_TIKTOK_APP_KEY") or "").strip()
    client_secret = (os.environ.get("ECOHUB_TIKTOK_APP_SECRET") or "").strip()
    if not client_key or not client_secret:
        return {"_error": "Thiếu ECOHUB_TIKTOK_APP_KEY hoặc ECOHUB_TIKTOK_APP_SECRET"}
    if not merchant_id:
        return {"_error": "Thiếu merchant_id"}

    try:
        import requests
    except Exception:
        return {"_error": "Thiếu thư viện requests"}

    token_url = "https://open.tiktokapis.com/merchant/oauth/token/"
    payload = {
        "client_key": client_key,
        "client_secret": client_secret,
        "merchant_id": merchant_id,
        "grant_type": "refresh_token" if refresh_token else "access_token",
    }
    if refresh_token:
        payload["refresh_token"] = refresh_token

    try:
        resp = requests.post(
            token_url,
            data=payload,
            headers={
                "Content-Type": "application/x-www-form-urlencoded",
                "Accept": "application/json",
                "x-tt-target-idc": "alisg",
            },
            timeout=20,
        )
        raw_text = resp.text or ""
        if resp.status_code >= 400:
            return {"_error": f"HTTP {resp.status_code}", "_raw": raw_text[:500], "_url": token_url}
        try:
            data = resp.json()
        except Exception:
            return {"_error": "Invalid JSON response", "_raw": raw_text[:500], "_url": token_url}
        if isinstance(data, dict):
            if data.get("error"):
                return {
                    "_error": str(data.get("error")),
                    "_raw": str(data.get("error_description") or data.get("message") or data)[:500],
                    "_url": token_url,
                }
            data["_url"] = token_url
            return data
        return {"_error": "Unexpected response type", "_raw": str(data)[:500], "_url": token_url}
    except Exception as e:
        msg = str(e)
        if "NameResolutionError" in msg or "getaddrinfo failed" in msg:
            msg = (
                "Python không resolve được DNS tới host TikTok. "
                "Kiểm tra DNS hệ điều hành, proxy/VPN, hoặc đổi DNS máy sang 1.1.1.1 / 8.8.8.8 rồi thử lại."
            )
        return {"_error": msg, "_url": token_url}


def _deep_scan_tiktok_token_fields(root: Any, depth: int = 0) -> dict[str, Any]:
    """Tìm token/shop/merchant trong JSON lồng nhau (TikTok đôi khi trả trong data.*)."""
    out: dict[str, Any] = {}
    if depth > 10 or not isinstance(root, dict):
        return out
    alias_groups = (
        ("access_token", ("access_token", "accessToken", "seller_access_token")),
        ("refresh_token", ("refresh_token", "refreshToken")),
        ("shop_cipher", ("shop_cipher", "shopCipher", "cipher")),
        ("shop_id", ("shop_id", "shopId")),
        ("merchant_id", ("merchant_id", "merchantId", "seller_id")),
    )
    for canonical, aliases in alias_groups:
        if canonical in out:
            continue
        for a in aliases:
            v = root.get(a)
            if v is None:
                continue
            s = str(v).strip()
            if s:
                out[canonical] = v if isinstance(v, str) else s
                break
    for v in root.values():
        if isinstance(v, dict):
            sub = _deep_scan_tiktok_token_fields(v, depth + 1)
        elif isinstance(v, list):
            sub = {}
            for it in v:
                if isinstance(it, dict):
                    sub.update(_deep_scan_tiktok_token_fields(it, depth + 1))
        else:
            continue
        for k, sv in sub.items():
            if k not in out or not str(out.get(k) or "").strip():
                out[k] = sv
    return out


def _extract_tiktok_token_fields(payload: Any) -> dict[str, Any]:
    """
    Chuẩn hóa dữ liệu token từ nhiều shape response của TikTok.
    Trả về dict phẳng gồm access_token/refresh_token/shop_id/shop_cipher/merchant_id nếu có.
    """
    if not isinstance(payload, dict):
        return {}
    data_obj = payload.get("data")
    source = data_obj if isinstance(data_obj, dict) else payload
    out: dict[str, Any] = {}
    for key in ("access_token", "refresh_token", "shop_id", "shop_cipher", "merchant_id"):
        value = source.get(key) if isinstance(source, dict) else None
        if value is None:
            value = payload.get(key)
        if value is not None:
            out[key] = value
    deep = _deep_scan_tiktok_token_fields(payload)
    for k, v in deep.items():
        if k not in out or not str(out.get(k) or "").strip():
            out[k] = v
    return out


def _build_tiktok_metadata_sign(params: dict[str, Any], app_secret: str, path: str, body_raw: str = "") -> str:
    """
    Ký request giống TikTokClient nhưng KHÔNG ép phải có shop_cipher.
    Dùng cho các endpoint enrichment để tự lấy metadata shop sau OAuth callback.
    """
    import hashlib
    import hmac

    sign_params = {k: params[k] for k in params.keys() if k not in {"sign", "access_token"}}
    param_str = "".join(f"{k}{sign_params[k]}" for k in sorted(sign_params.keys()))
    payload = f"{app_secret}{path}{param_str}{body_raw}{app_secret}"
    return hmac.new(
        app_secret.encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def _extract_tiktok_shop_metadata_fields(payload: Any) -> dict[str, str]:
    """
    Cố gắng rút merchant_id/shop_id/shop_cipher từ nhiều shape response khác nhau.
    Không dùng alias 'id' ở hàm generic để tránh bắt nhầm; ở đây chỉ áp dụng
    cho các object "shop-like" đã biết ngữ cảnh.
    """
    out = {k: "" for k in ("merchant_id", "shop_id", "shop_cipher")}
    token_like = _extract_tiktok_token_fields(payload)
    for k in out.keys():
        val = str(token_like.get(k) or "").strip()
        if val:
            out[k] = val

    if not isinstance(payload, dict):
        return out

    data_obj = payload.get("data")
    candidates: list[tuple[dict[str, Any], str]] = []

    def _append_rows(rows: Any, kind: str) -> None:
        if isinstance(rows, list):
            for item in rows:
                if isinstance(item, dict):
                    candidates.append((item, kind))

    if isinstance(data_obj, dict):
        for key, kind in (
            ("shop", "shop"),
            ("seller", "seller"),
            ("authorized_shop", "shop"),
            ("merchant", "merchant"),
        ):
            obj = data_obj.get(key)
            if isinstance(obj, dict):
                candidates.append((obj, kind))
        for key, kind in (
            ("shops", "shop"),
            ("shop_list", "shop"),
            ("shop_infos", "shop"),
            ("active_shops", "shop"),
            ("authorized_shops", "shop"),
            ("seller_shops", "shop"),
            ("merchants", "merchant"),
            ("merchant_list", "merchant"),
            ("seller_list", "merchant"),
        ):
            _append_rows(data_obj.get(key), kind)
    elif isinstance(data_obj, list):
        _append_rows(data_obj, "shop")

    def _first(*names: str, source: dict[str, Any]) -> str:
        for name in names:
            value = source.get(name)
            if value is None:
                continue
            text = str(value).strip()
            if text:
                return text
        return ""

    for row, kind in candidates:
        if kind == "merchant":
            if not out["merchant_id"]:
                out["merchant_id"] = _first("merchant_id", "merchantId", "seller_id", "sellerId", "code", "id", source=row)
            if not out["shop_id"]:
                out["shop_id"] = _first("shop_id", "shopId", source=row)
            if not out["shop_cipher"]:
                out["shop_cipher"] = _first("shop_cipher", "shopCipher", "cipher", source=row)
        else:
            if not out["shop_id"]:
                out["shop_id"] = _first("shop_id", "shopId", "id", source=row)
            if not out["shop_cipher"]:
                out["shop_cipher"] = _first("shop_cipher", "shopCipher", "cipher", source=row)
            if not out["merchant_id"]:
                out["merchant_id"] = _first("merchant_id", "merchantId", "seller_id", "sellerId", "code", source=row)
        if all(out.values()):
            break

    return {k: v for k, v in out.items() if str(v or "").strip()}


def _request_tiktok_metadata_endpoint(
    method: str,
    path: str,
    access_token: str,
    *,
    query_params: dict[str, Any] | None = None,
    body: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    Gọi các endpoint enrichment không yêu cầu biết trước shop_cipher.
    """
    _load_local_env_file()

    app_key = (os.environ.get("ECOHUB_TIKTOK_APP_KEY") or "").strip()
    app_secret = (os.environ.get("ECOHUB_TIKTOK_APP_SECRET") or "").strip()
    base_url = (os.environ.get("ECOHUB_TIKTOK_BASE_URL") or "https://open-api.tiktokglobalshop.com").strip()
    auth_header = (os.environ.get("ECOHUB_TIKTOK_AUTH_HEADER") or "x-tts-access-token").strip() or "x-tts-access-token"
    auth_scheme = (os.environ.get("ECOHUB_TIKTOK_AUTH_SCHEME") or "").strip()
    include_access_token_query = (os.environ.get("ECOHUB_TIKTOK_INCLUDE_ACCESS_TOKEN_QUERY") or "false").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }
    timeout_raw = (os.environ.get("ECOHUB_TIKTOK_TIMEOUT_SEC") or "20").strip()
    try:
        timeout_sec = max(5.0, float(timeout_raw))
    except Exception:
        timeout_sec = 20.0

    if not app_key or not app_secret:
        return {"_error": "Thiếu APP_KEY/APP_SECRET", "_url": f"{base_url}{path}"}
    if not access_token:
        return {"_error": "Thiếu access_token", "_url": f"{base_url}{path}"}

    try:
        import requests
    except Exception:
        return {"_error": "Thiếu thư viện requests", "_url": f"{base_url}{path}"}

    req_path = path if path.startswith("/") else f"/{path}"
    query: dict[str, Any] = dict(query_params or {})
    query["app_key"] = app_key
    query["timestamp"] = str(int(time.time()))
    if include_access_token_query:
        query["access_token"] = access_token

    body_obj = dict(body or {})
    body_raw = ""
    if method.strip().upper() != "GET" and body_obj:
        body_raw = json.dumps(body_obj, ensure_ascii=False, separators=(",", ":"))

    query["sign"] = _build_tiktok_metadata_sign(query, app_secret, req_path, body_raw)

    headers = {"Accept": "application/json"}
    if method.strip().upper() != "GET":
        headers["Content-Type"] = "application/json"
    if auth_scheme:
        headers[auth_header] = f"{auth_scheme} {access_token}".strip()
    else:
        headers[auth_header] = access_token
    try:
        raw_extra_headers = (os.environ.get("ECOHUB_TIKTOK_EXTRA_HEADERS") or "").strip()
        if raw_extra_headers:
            extra_headers = json.loads(raw_extra_headers)
            if isinstance(extra_headers, dict):
                headers.update({str(k): str(v) for k, v in extra_headers.items()})
    except Exception:
        pass

    url = f"{base_url.rstrip('/')}{req_path}"
    try:
        resp = requests.request(
            method=method.strip().upper(),
            url=url,
            params=query,
            json=(body_obj if method.strip().upper() != "GET" else None),
            headers=headers,
            timeout=timeout_sec,
        )
        raw_text = resp.text or ""
        if resp.status_code >= 400:
            return {"_error": f"HTTP {resp.status_code}", "_raw": raw_text[:500], "_url": url}
        try:
            data = resp.json()
        except Exception:
            return {"_error": "Invalid JSON response", "_raw": raw_text[:500], "_url": url}
        if not isinstance(data, dict):
            return {"_error": "Unexpected response type", "_raw": str(data)[:500], "_url": url}
        data["_url"] = url
        return data
    except Exception as e:
        return {"_error": str(e), "_url": url}


def _fetch_tiktok_shop_metadata(access_token: str) -> dict[str, Any]:
    """
    Sau khi có access_token, thử gọi thêm API để lấy merchant_id/shop_id/shop_cipher.
    TikTok không phải lúc nào cũng trả đủ các field này trong callback token exchange.
    """
    if not access_token:
        return {"_error": "Thiếu access_token"}

    versions: list[str] = []
    for ver in (
        (os.environ.get("ECOHUB_TIKTOK_VERSION") or "").strip(),
        "202309",
        "202306",
    ):
        if ver and ver not in versions:
            versions.append(ver)

    merged_fields: dict[str, str] = {}
    attempts: list[dict[str, Any]] = []

    for ver in versions:
        endpoint_specs = [
            ("GET", f"/seller/{ver}/shops", {}, None, "active_shops"),
            ("GET", f"/seller/{ver}/active_shops", {}, None, "active_shops_fallback"),
            ("GET", f"/seller/global/{ver}/merchants", {}, None, "merchant_info"),
        ]
        if merged_fields.get("shop_id"):
            endpoint_specs.append(
                (
                    "GET",
                    f"/authorization/{ver}/shops",
                    {"shop_id": merged_fields.get("shop_id")},
                    None,
                    "authorization_shops_by_id",
                )
            )
        endpoint_specs.append(
            ("GET", f"/authorization/{ver}/shops", {}, None, "authorization_shops")
        )

        for method, path, query_params, body, label in endpoint_specs:
            resp = _request_tiktok_metadata_endpoint(
                method,
                path,
                access_token,
                query_params=query_params,
                body=body,
            )
            fields = _extract_tiktok_shop_metadata_fields(resp)
            for key in ("merchant_id", "shop_id", "shop_cipher"):
                if fields.get(key) and not merged_fields.get(key):
                    merged_fields[key] = str(fields[key]).strip()
            attempts.append(
                {
                    "label": label,
                    "method": method,
                    "path": path,
                    "query_params": query_params,
                    "body": body,
                    "url": resp.get("_url") if isinstance(resp, dict) else "",
                    "api_code": resp.get("code") if isinstance(resp, dict) else None,
                    "api_message": (resp.get("message") or resp.get("msg")) if isinstance(resp, dict) else "",
                    "found_fields": fields,
                    "error": resp.get("_error") if isinstance(resp, dict) else "unexpected_response",
                    "response": resp,
                }
            )

    return {
        "ok": bool(merged_fields),
        "fields": merged_fields,
        "attempts": attempts,
        "_error": "" if merged_fields else "Không lấy được metadata shop từ các endpoint enrichment đã thử.",
    }


def _exchange_tiktok_authorized_code(auth_code: str) -> dict:
    """
    Exchange code callback -> token bundle (access + refresh).
    Flow này là nơi TikTok trả refresh_token lần đầu.
    """
    app_key = (os.environ.get("ECOHUB_TIKTOK_APP_KEY") or "").strip()
    app_secret = (os.environ.get("ECOHUB_TIKTOK_APP_SECRET") or "").strip()
    token_url = (os.environ.get("ECOHUB_TIKTOK_TOKEN_EXCHANGE_URL") or "").strip()
    candidate_urls = []
    if token_url:
        candidate_urls.append(token_url)
    for fallback_url in (
        "https://auth.tiktok-shops.com/api/v2/token/get",
        "https://auth.tiktok-p.com/api/v2/token/get",
    ):
        if fallback_url not in candidate_urls:
            candidate_urls.append(fallback_url)
    if not app_key or not app_secret:
        return {"_error": "Thiếu ECOHUB_TIKTOK_APP_KEY hoặc ECOHUB_TIKTOK_APP_SECRET", "_url": candidate_urls[0]}
    if not auth_code:
        return {"_error": "Thiếu auth_code để đổi token", "_url": candidate_urls[0]}

    try:
        import requests
    except Exception:
        return {"_error": "Thiếu thư viện requests", "_url": candidate_urls[0]}

    _tiktok_auth_debug_log(
        "exchange authorized_code: "
        f"app_key={app_key[:4]}… (len={len(app_key)}), "
        f"auth_code_len={len(auth_code)}, "
        f"candidate_urls={candidate_urls}"
    )

    payload = {
        "app_key": app_key,
        "app_secret": app_secret,
        "auth_code": auth_code,
        "grant_type": "authorized_code",
    }
    def _is_network_resolution_error(msg: str) -> bool:
        text = (msg or "").lower()
        return (
            "nameresolutionerror" in text
            or "getaddrinfo failed" in text
            or "failed to establish a new connection" in text
            or "connection aborted" in text
            or "connection reset" in text
            or "connection timed out" in text
            or "read timed out" in text
        )

    last_error: dict[str, Any] | None = None
    for url in candidate_urls:
        try:
            # TikTok Shop v2 token/get dùng query params.
            resp = requests.get(
                url,
                params=payload,
                headers={"Accept": "application/json"},
                timeout=20,
            )
            raw_text = resp.text or ""
            if resp.status_code >= 400:
                last_error = {"_error": f"HTTP {resp.status_code}", "_raw": raw_text[:500], "_url": url}
                _tiktok_auth_debug_log(f"token URL={url} -> HTTP {resp.status_code} body_head={raw_text[:280]!r}")
                # Có phản hồi HTTP thì coi là đã chạm đúng endpoint, không fallback tiếp.
                return last_error
                continue
            try:
                data = resp.json()
            except Exception:
                _tiktok_auth_debug_log(f"token URL={url} -> invalid JSON head={raw_text[:280]!r}")
                return {"_error": "Invalid JSON response", "_raw": raw_text[:500], "_url": url}
            if not isinstance(data, dict):
                return {"_error": "Unexpected response type", "_raw": str(data)[:500], "_url": url}

            api_code = data.get("code")
            if api_code not in (None, 0, "0"):
                msg = str(data.get("message") or data.get("msg") or data)[:500]
                _tiktok_auth_debug_log(
                    f"token URL={url} -> api code={api_code!r} message={msg[:220]!r}"
                )
                return {
                    "_error": str(api_code),
                    "_raw": msg,
                    "_url": url,
                }
            token_fields = _extract_tiktok_token_fields(data)
            data["_url"] = url
            data["_token_fields"] = token_fields
            if not token_fields.get("access_token"):
                data["_error"] = "Thiếu access_token trong response đổi authorized_code"
                _tiktok_auth_debug_log(f"token URL={url} -> success JSON nhưng không có access_token keys={list(data.keys())[:20]}")
                return data
            _tiktok_auth_debug_log(f"token URL={url} -> exchange OK (có access_token)")
            return data
        except Exception as e:
            last_error = {"_error": str(e), "_url": url}
            # Chỉ thử URL tiếp theo nếu lỗi mạng/DNS.
            if not _is_network_resolution_error(str(e)):
                return last_error
            continue

    return last_error or {"_error": "Không thể exchange token", "_url": candidate_urls[0]}


def _refresh_tiktok_access_token(refresh_token: str) -> dict:
    """
    Dùng refresh_token để lấy access_token mới (và refresh_token mới).
    """
    app_key = (os.environ.get("ECOHUB_TIKTOK_APP_KEY") or "").strip()
    app_secret = (os.environ.get("ECOHUB_TIKTOK_APP_SECRET") or "").strip()
    refresh_url = (
        os.environ.get("ECOHUB_TIKTOK_REFRESH_URL")
        or "https://auth.tiktok-shops.com/api/v2/token/refresh"
    ).strip()
    if not app_key or not app_secret:
        return {"_error": "Thiếu ECOHUB_TIKTOK_APP_KEY hoặc ECOHUB_TIKTOK_APP_SECRET", "_url": refresh_url}
    if not refresh_token:
        return {"_error": "Thiếu refresh_token để làm mới access_token", "_url": refresh_url}
    try:
        import requests
    except Exception:
        return {"_error": "Thiếu thư viện requests", "_url": refresh_url}

    payload = {
        "app_key": app_key,
        "app_secret": app_secret,
        "refresh_token": refresh_token,
        "grant_type": "refresh_token",
    }
    try:
        resp = requests.get(
            refresh_url,
            params=payload,
            headers={"Accept": "application/json"},
            timeout=20,
        )
        raw_text = resp.text or ""
        if resp.status_code >= 400:
            return {"_error": f"HTTP {resp.status_code}", "_raw": raw_text[:500], "_url": refresh_url}
        try:
            data = resp.json()
        except Exception:
            return {"_error": "Invalid JSON response", "_raw": raw_text[:500], "_url": refresh_url}
        if not isinstance(data, dict):
            return {"_error": "Unexpected response type", "_raw": str(data)[:500], "_url": refresh_url}
        api_code = data.get("code")
        if api_code not in (None, 0, "0"):
            return {
                "_error": str(api_code),
                "_raw": str(data.get("message") or data.get("msg") or data)[:500],
                "_url": refresh_url,
            }
        token_fields = _extract_tiktok_token_fields(data)
        data["_token_fields"] = token_fields
        data["_url"] = refresh_url
        if not token_fields.get("access_token"):
            data["_error"] = "Thiếu access_token trong response refresh token"
        return data
    except Exception as e:
        return {"_error": str(e), "_url": refresh_url}


def _tiktok_token_auto_refresh_worker() -> None:
    """
    Worker nền: định kỳ refresh token và lưu lại token mới vào DB.
    """
    interval_sec_raw = (os.environ.get("ECOHUB_TIKTOK_AUTO_REFRESH_INTERVAL_SEC") or "10800").strip()
    try:
        interval_sec = max(600, int(interval_sec_raw))
    except Exception:
        interval_sec = 10800
    print(f"[TIKTOK AUTO REFRESH] Started (interval={interval_sec}s)")
    while True:
        try:
            records = list_tiktok_authorizations(TIKTOK_AUTH_DB)
            creds = _build_current_tiktok_credentials(records)
            current_refresh_token = (creds.get("refresh_token") or "").strip()
            if not current_refresh_token:
                print("[TIKTOK AUTO REFRESH] Skip: chưa có refresh_token trong DB.")
            else:
                exchange = _refresh_tiktok_access_token(current_refresh_token)
                token_fields = {}
                if isinstance(exchange, dict):
                    token_fields = _extract_tiktok_token_fields(exchange.get("_token_fields") or exchange)
                if exchange.get("_error"):
                    reason = str(exchange.get("_raw") or exchange.get("_error") or "").strip()
                    if len(reason) > 180:
                        reason = reason[:180] + "..."
                    print(f"[TIKTOK AUTO REFRESH] Failed: {reason}")
                else:
                    new_access_token = str(token_fields.get("access_token") or "").strip()
                    if new_access_token:
                        new_refresh_token = str(token_fields.get("refresh_token") or current_refresh_token).strip()
                        metadata_exchange = _fetch_tiktok_shop_metadata(new_access_token)
                        metadata_fields = {}
                        if isinstance(metadata_exchange, dict):
                            metadata_fields = metadata_exchange.get("fields") or {}
                        for key in ("merchant_id", "shop_id", "shop_cipher"):
                            current_val = str(token_fields.get(key) or "").strip()
                            meta_val = str(metadata_fields.get(key) or "").strip()
                            if meta_val and not current_val:
                                token_fields[key] = meta_val
                        insert_tiktok_authorization(
                            TIKTOK_AUTH_DB,
                            merchant_id=str(token_fields.get("merchant_id") or creds.get("merchant_id") or ""),
                            shop_id=str(token_fields.get("shop_id") or creds.get("shop_id") or ""),
                            shop_cipher=str(token_fields.get("shop_cipher") or creds.get("shop_cipher") or ""),
                            access_token=new_access_token,
                            refresh_token=new_refresh_token,
                            raw_query_json=json.dumps(
                                {
                                    "type": "auto_refresh",
                                    "interval_sec": interval_sec,
                                },
                                ensure_ascii=False,
                            ),
                            raw_exchange_json=json.dumps(
                                {
                                    "refresh_exchange": exchange,
                                    "metadata_exchange": metadata_exchange,
                                },
                                ensure_ascii=False,
                            ),
                        )
                        print("[TIKTOK AUTO REFRESH] Success: đã cập nhật access_token + refresh_token mới vào DB.")
                    else:
                        print("[TIKTOK AUTO REFRESH] Failed: response không có access_token.")
        except Exception as e:
            print(f"[TIKTOK AUTO REFRESH] Unexpected error: {e}")
        time.sleep(interval_sec)


def _build_current_tiktok_credentials(records: list[Any]) -> dict[str, str]:
    """
    Gom thông tin TikTok hiện có để hiển thị/copy dùng cho API.
    list_authorizations trả về ORDER BY id DESC: với mỗi trường, lấy giá trị khác rỗng đầu tiên
    (bản mới nhất *có trường đó*). Tránh một dòng callback trống token che dòng trước còn hiệu lực.
    Token/cipher từ DB được ưu tiên; chỉ fallback .env khi không có trong mọi bản ghi.
    """
    creds = {
        "merchant_id": (os.environ.get("ECOHUB_TIKTOK_MERCHANT_ID") or "").strip(),
        "shop_id": (os.environ.get("ECOHUB_TIKTOK_SHOP_ID") or "").strip(),
        "shop_cipher": (os.environ.get("ECOHUB_TIKTOK_SHOP_CIPHER") or "").strip(),
        "access_token": (os.environ.get("ECOHUB_TIKTOK_ACCESS_TOKEN") or "").strip(),
        "refresh_token": (os.environ.get("ECOHUB_TIKTOK_REFRESH_TOKEN") or "").strip(),
        "app_key": (os.environ.get("ECOHUB_TIKTOK_APP_KEY") or "").strip(),
        "source": "env",
    }
    if not records:
        return creds

    def _row_field(row: Any, name: str) -> str:
        return str(getattr(row, name, "") or "").strip()

    def _first_nonempty(field: str) -> str:
        for r in records:
            v = _row_field(r, field)
            if v:
                return v
        return ""

    db_access = _first_nonempty("access_token")
    db_refresh = _first_nonempty("refresh_token")
    db_cipher = _first_nonempty("shop_cipher")
    db_merchant = _first_nonempty("merchant_id")
    db_shop = _first_nonempty("shop_id")

    if db_access or db_refresh or db_cipher or db_merchant or db_shop:
        creds["source"] = "db"
    if db_access:
        creds["access_token"] = db_access
    if db_refresh:
        creds["refresh_token"] = db_refresh
    if db_cipher:
        creds["shop_cipher"] = db_cipher
    if db_merchant:
        creds["merchant_id"] = db_merchant
    if db_shop:
        creds["shop_id"] = db_shop

    return creds


def _find_tiktok_auth_record(records: list[Any], auth_id: int) -> Any | None:
    if not isinstance(records, list) or auth_id is None:
        return None
    for row in records:
        try:
            if int(getattr(row, "id", -1)) == auth_id:
                return row
        except Exception:
            continue
    return None


def _get_selected_tiktok_auth_id() -> int | None:
    raw = session.get("tiktok_selected_auth_id")
    try:
        return int(raw)
    except Exception:
        return None


def _build_current_tiktok_credentials(records: list[Any], selected_auth_id: int | None = None) -> dict[str, str]:
    """
    Gom thông tin TikTok hiện có để hiển thị/copy dùng cho API.
    Nếu người dùng chọn shop cụ thể, ưu tiên record được chọn nhưng vẫn fallback DB/.env.
    """
    creds = {
        "merchant_id": (os.environ.get("ECOHUB_TIKTOK_MERCHANT_ID") or "").strip(),
        "shop_id": (os.environ.get("ECOHUB_TIKTOK_SHOP_ID") or "").strip(),
        "shop_cipher": (os.environ.get("ECOHUB_TIKTOK_SHOP_CIPHER") or "").strip(),
        "access_token": (os.environ.get("ECOHUB_TIKTOK_ACCESS_TOKEN") or "").strip(),
        "refresh_token": (os.environ.get("ECOHUB_TIKTOK_REFRESH_TOKEN") or "").strip(),
        "app_key": (os.environ.get("ECOHUB_TIKTOK_APP_KEY") or "").strip(),
        "source": "env",
    }
    if not records:
        return creds

    selected_row = _find_tiktok_auth_record(records, selected_auth_id) if selected_auth_id else None

    def _row_field(row: Any, name: str) -> str:
        return str(getattr(row, name, "") or "").strip()

    def _first_nonempty(field: str) -> str:
        for r in records:
            v = _row_field(r, field)
            if v:
                return v
        return ""

    def _selected_field(field: str) -> str:
        if not selected_row:
            return ""
        return _row_field(selected_row, field)

    db_access = _selected_field("access_token") or _first_nonempty("access_token")
    db_refresh = _selected_field("refresh_token") or _first_nonempty("refresh_token")
    db_cipher = _selected_field("shop_cipher") or _first_nonempty("shop_cipher")
    db_merchant = _selected_field("merchant_id") or _first_nonempty("merchant_id")
    db_shop = _selected_field("shop_id") or _first_nonempty("shop_id")

    if db_access or db_refresh or db_cipher or db_merchant or db_shop:
        creds["source"] = "db_selected" if selected_row else "db"
    if db_access:
        creds["access_token"] = db_access
    if db_refresh:
        creds["refresh_token"] = db_refresh
    if db_cipher:
        creds["shop_cipher"] = db_cipher
    if db_merchant:
        creds["merchant_id"] = db_merchant
    if db_shop:
        creds["shop_id"] = db_shop

    return creds



def _dedupe_tiktok_shop_records(records: list[Any]) -> list[Any]:
    """
    Lọc danh sách ủy quyền để tab "Danh sách shop" chỉ hiển thị 1 lần / 1 shop.

    Ưu tiên nhận diện shop theo:
    1) shop_cipher
    2) shop_id
    3) merchant_id
    4) id bản ghi nếu thiếu toàn bộ thông tin shop

    list_tiktok_authorizations() đang trả bản ghi mới nhất trước,
    nên bản được giữ lại là bản mới nhất của mỗi shop.
    """
    out: list[Any] = []
    seen: set[tuple[str, str]] = set()

    for row in records or []:
        shop_cipher = str(getattr(row, "shop_cipher", "") or "").strip()
        shop_id = str(getattr(row, "shop_id", "") or "").strip()
        merchant_id = str(getattr(row, "merchant_id", "") or "").strip()

        if shop_cipher:
            key = ("shop_cipher", shop_cipher)
        elif shop_id:
            key = ("shop_id", shop_id)
        elif merchant_id:
            key = ("merchant_id", merchant_id)
        else:
            key = ("row_id", str(getattr(row, "id", "") or id(row)))

        if key in seen:
            continue

        seen.add(key)
        out.append(row)

    return out

def _short_merchant_display(merchant_id: str) -> str:
    """Hiển thị merchant_id dạng rút gọn cho giao diện người bán."""
    mid = (merchant_id or "").strip()
    if not mid:
        return "—"
    if len(mid) <= 8:
        return mid
    return f"{mid[:3]}…{mid[-4:]}"


def _short_shop_id_display(shop_id: str, visible_tail: int = 5) -> str:
    """Hiển thị shop_id dạng rút gọn, chỉ giữ vài số cuối."""
    sid = (shop_id or "").strip()
    if not sid:
        return "—"
    if len(sid) <= visible_tail:
        return sid
    return f"****{sid[-visible_tail:]}"


def _tiktok_order_activity_snapshot() -> dict[str, int]:
    """Thống kê đơn trong phiên app (hàng chờ / đang đóng / thêm trong ngày)."""
    with state_lock:
        q_raw = app_state.get("order_queue") or []
        q = list(q_raw) if isinstance(q_raw, list) else []
        cur_id = app_state.get("current_order_id")
    start_ts = datetime.now(GMT7).replace(hour=0, minute=0, second=0, microsecond=0).timestamp()
    today_count = 0
    for e in q:
        if not isinstance(e, dict):
            continue
        ts = float(e.get("created_at") or 0)
        if ts >= start_ts:
            today_count += 1
    pending = sum(1 for e in q if isinstance(e, dict) and e.get("id") != cur_id)
    packing_active = 1 if cur_id else 0
    return {
        "today_count": today_count,
        "queue_pending": pending,
        "packing_active": packing_active,
        "session_total": len(q),
    }


def _build_tiktok_seller_snapshot(creds: dict[str, str]) -> dict[str, Any]:
    """
    Dữ liệu hiển thị cho người bán: trạng thái kết nối, cửa hàng, cảnh báo ngắn (không lộ token).
    """
    has_access = bool((creds.get("access_token") or "").strip())
    has_refresh = bool((creds.get("refresh_token") or "").strip())
    has_cipher = bool((creds.get("shop_cipher") or "").strip())
    alerts: list[dict[str, str]] = []

    if not has_access and has_refresh:
        status = "refresh_only"
        headline = "Có refresh token, chưa có access token"
        detail = "Thử «Kiểm tra kết nối» hoặc «Kết nối lại TikTok» để lấy access token dùng API."
        badge_class = "warning"
        alerts.append(
            {
                "level": "warning",
                "text": "Đã lưu quyền gia hạn (refresh) nhưng chưa đọc được access token — cần làm mới hoặc ủy quyền lại.",
            }
        )
    elif not has_access:
        status = "not_linked"
        headline = "Chưa liên kết TikTok Shop"
        detail = "Hãy kết nối để đồng bộ đơn hàng và dùng đầy đủ tính năng kho."
        badge_class = "secondary"
    elif has_access and has_refresh and has_cipher:
        status = "linked"
        headline = "Đã liên kết"
        detail = "Kết nối ổn định. Hệ thống có thể làm mới quyền truy cập tự động."
        badge_class = "success"
    elif has_access and has_cipher:
        status = "degraded"
        headline = "Liên kết chưa đầy đủ"
        detail = "Đang có quyền truy cập nhưng thiếu refresh token — nên kết nối lại để tự động gia hạn lâu dài."
        badge_class = "warning"
        alerts.append(
            {
                "level": "warning",
                "text": "Khuyến nghị bấm «Kết nối lại TikTok» để hệ thống lưu đủ quyền gia hạn.",
            }
        )
    else:
        status = "partial"
        headline = "Cấu hình thiếu bước"
        detail = "Thiếu shop cipher hoặc thông tin cần cho API. Hoàn tất ủy quyền hoặc liên hệ kỹ thuật."
        badge_class = "warning"
        alerts.append({"level": "warning", "text": "Kiểm tra lại bước ủy quyền hoặc cấu hình shop."})

    env_shop_name = (os.environ.get("ECOHUB_TIKTOK_SHOP_DISPLAY_NAME") or "").strip()
    shop_id = (creds.get("shop_id") or "").strip()
    merchant_id = (creds.get("merchant_id") or "").strip()
    shop_short = _short_shop_id_display(shop_id)
    if env_shop_name:
        shop_name = env_shop_name
    elif shop_id:
        shop_name = f"Shop {shop_short}"
    elif merchant_id:
        shop_name = f"Merchant {merchant_id[:3]}…{merchant_id[-4:]}" if len(merchant_id) > 8 else merchant_id
    else:
        shop_name = "—"
    merchant_short = _short_merchant_display(creds.get("merchant_id") or "")
    orders = _tiktok_order_activity_snapshot()
    help_url = (os.environ.get("ECOHUB_TIKTOK_HELP_URL") or "").strip() or "https://partner.tiktokshop.com/"

    return {
        "status": status,
        "headline": headline,
        "detail": detail,
        "badge_class": badge_class,
        "shop_name": shop_name,
        "shop_short": shop_short,
        "merchant_short": merchant_short,
        "alerts": alerts,
        "orders": orders,
        "help_url": help_url,
    }


def _mask_secret(value: str, keep: int = 6) -> str:
    value = (value or "").strip()
    if not value:
        return ""
    if len(value) <= keep:
        return "*" * len(value)
    return ("*" * max(0, len(value) - keep)) + value[-keep:]


def _tiktok_auth_debug_enabled() -> bool:
    """
    Bật log chi tiết OAuth + cho phép GET /tiktok-auth/debug (JSON, chỉ admin).
    Đặt ECOHUB_TIKTOK_AUTH_DEBUG=1 trong .env — tắt trên máy khách khi không cần support.
    """
    return (os.environ.get("ECOHUB_TIKTOK_AUTH_DEBUG") or "").strip().lower() in {"1", "true", "yes", "on"}


def _tiktok_auth_debug_log(message: str) -> None:
    if not _tiktok_auth_debug_enabled():
        return
    try:
        print(f"[TIKTOK AUTH DEBUG] {message}")
    except Exception:
        pass


def _latest_tiktok_auth_debug_row() -> dict[str, Any]:
    records = list_tiktok_authorizations(TIKTOK_AUTH_DB)
    if not records:
        return {}
    latest = records[0]
    return {
        "id": latest.id,
        "state": latest.state,
        "auth_code_masked": _mask_secret(latest.auth_code, keep=10),
        "merchant_id": latest.merchant_id,
        "shop_id": latest.shop_id,
        "shop_cipher_masked": _mask_secret(latest.shop_cipher),
        "access_token_masked": _mask_secret(latest.access_token),
        "refresh_token_masked": _mask_secret(latest.refresh_token),
        "created_at": latest.created_at,
        "raw_query_json": latest.raw_query_json,
        "raw_exchange_json": latest.raw_exchange_json,
    }


def _run_tiktok_env_api_test() -> dict[str, Any]:
    """
    Gọi thử TikTok Shop API bằng access_token + shop_cipher hiện app đang dùng.
    Ưu tiên endpoint order/search hiện có của dự án để kiểm tra credential end-to-end.
    """
    _load_local_env_file()
    selected_auth_id = _get_selected_tiktok_auth_id()
    client = None
    if selected_auth_id is not None:
        records = list_tiktok_authorizations(TIKTOK_AUTH_DB)
        selected = _find_tiktok_auth_record(records, selected_auth_id)
        if selected:
            selected_access = str(getattr(selected, "access_token", "") or "").strip()
            selected_cipher = str(getattr(selected, "shop_cipher", "") or "").strip()
            if selected_access and selected_cipher:
                try:
                    client = TikTokClient.from_tokens(
                        access_token=selected_access,
                        shop_cipher=selected_cipher,
                    )
                except Exception:
                    client = None
    if client is None:
        client = TikTokClient.from_env()
    endpoint_path = (os.environ.get("ECOHUB_ORDER_API_ENDPOINT_PATH") or "/order/202309/orders/search").strip()
    method = (os.environ.get("ECOHUB_ORDER_API_METHOD") or "POST").strip().upper()
    query_params = {}
    body = {}
    try:
        raw_query = (os.environ.get("ECOHUB_ORDER_API_QUERY_PARAMS") or "").strip()
        raw_body = (os.environ.get("ECOHUB_ORDER_API_BODY_TEMPLATE") or "").strip()
        if raw_query:
            query_params = json.loads(raw_query)
        if raw_body:
            body = json.loads(raw_body)
    except Exception:
        pass

    # Dùng page_size nhỏ để test nhẹ, không phụ thuộc mã đơn cụ thể.
    if not isinstance(query_params, dict):
        query_params = {}
    query_params.setdefault("page_size", "1")
    if not isinstance(body, dict):
        body = {}

    try:
        root = client.request(
            method=method,
            path=endpoint_path,
            query_params=query_params,
            body=(body if method != "GET" else None),
        )
        out = {
            "ok": True,
            "request": {
                "method": method,
                "path": endpoint_path,
                "query_params": query_params,
                "body": body if method != "GET" else None,
            },
            "response_type": type(root).__name__,
            "response": root,
        }
        if isinstance(root, dict):
            out["api_code"] = root.get("code")
            out["api_message"] = root.get("message") or root.get("msg")
        return out
    except TikTokApiError as e:
        return {
            "ok": False,
            "request": {
                "method": method,
                "path": endpoint_path,
                "query_params": query_params,
                "body": body if method != "GET" else None,
            },
            "error_type": "TikTokApiError",
            "error": str(e),
        }
    except Exception as e:
        return {
            "ok": False,
            "request": {
                "method": method,
                "path": endpoint_path,
                "query_params": query_params,
                "body": body if method != "GET" else None,
            },
            "error_type": type(e).__name__,
            "error": str(e),
        }


@app.route("/tiktok-auth", methods=["GET"])
def tiktok_auth_page():
    if "user" not in session:
        return redirect(url_for("login"))
    all_records = list_tiktok_authorizations(TIKTOK_AUTH_DB)
    selected_auth_id = _get_selected_tiktok_auth_id()
    current_credentials = _build_current_tiktok_credentials(all_records, selected_auth_id=selected_auth_id)
    tiktok_seller = _build_tiktok_seller_snapshot(current_credentials)
    merchant_id = (os.environ.get("ECOHUB_TIKTOK_MERCHANT_ID") or "").strip()
    api_test_result = session.pop("tiktok_api_test_result", None)
    show_advanced = (os.environ.get("ECOHUB_TIKTOK_SHOW_ADVANCED") or "").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }
    # Tab "API status": chỉ hiển thị 10 bản ghi ủy quyền gần nhất.
    api_status_records = list(all_records or [])[:10]

    # Tab "Danh sách shop": chỉ hiển thị 1 lần cho mỗi shop.
    shop_records = _dedupe_tiktok_shop_records(list(all_records or []))

    return render_template(
        "tiktok_auth.html",
        records=api_status_records,
        api_status_records=api_status_records,
        shop_records=shop_records,
        selected_auth_id=selected_auth_id,
        merchant_id=merchant_id,
        current_credentials=current_credentials,
        api_test_result=api_test_result,
        show_advanced=show_advanced,
        tiktok_seller=tiktok_seller,
        is_admin=True,
    )


@app.route("/tiktok-auth/debug", methods=["GET"])
def tiktok_auth_debug():
    remote_addr = (request.remote_addr or "").strip()
    if "user" not in session:
        return jsonify({"error": "login_required"}), 401

    _load_local_env_file()
    records = list_tiktok_authorizations(TIKTOK_AUTH_DB)
    current_credentials = _build_current_tiktok_credentials(records)
    latest_row = _latest_tiktok_auth_debug_row()

    data = {
        "server_time": datetime.now().isoformat(),
        "request": {
            "host": request.host,
            "base_url": request.base_url,
            "url": request.url,
            "remote_addr": remote_addr,
        },
        "auth": {
            "session_user": session.get("user"),
            "is_admin": _is_admin_user(),
            "tiktok_auth_state": session.get("tiktok_auth_state"),
            "tiktok_auth_state_ts": session.get("tiktok_auth_state_ts"),
            "tiktok_auth_states": session.get("tiktok_auth_states"),
        },
        "config": {
            "redirect_uri_effective": _get_tiktok_redirect_uri(),
            "env": {
                "ECOHUB_TIKTOK_SERVICE_ID": (os.environ.get("ECOHUB_TIKTOK_SERVICE_ID") or "").strip(),
                "ECOHUB_TIKTOK_AUTH_BASE_URL": (os.environ.get("ECOHUB_TIKTOK_AUTH_BASE_URL") or "").strip(),
                "ECOHUB_TIKTOK_REDIRECT_URI": (os.environ.get("ECOHUB_TIKTOK_REDIRECT_URI") or "").strip(),
                "ECOHUB_TIKTOK_APP_KEY": (os.environ.get("ECOHUB_TIKTOK_APP_KEY") or "").strip(),
                "ECOHUB_TIKTOK_APP_SECRET_PRESENT": bool((os.environ.get("ECOHUB_TIKTOK_APP_SECRET") or "").strip()),
                "ECOHUB_TIKTOK_MERCHANT_ID": (os.environ.get("ECOHUB_TIKTOK_MERCHANT_ID") or "").strip(),
                "ECOHUB_TIKTOK_SHOP_CIPHER_MASKED": _mask_secret(os.environ.get("ECOHUB_TIKTOK_SHOP_CIPHER") or ""),
                "ECOHUB_TIKTOK_ACCESS_TOKEN_MASKED": _mask_secret(os.environ.get("ECOHUB_TIKTOK_ACCESS_TOKEN") or ""),
                "ECOHUB_TIKTOK_TIMEOUT_SEC": (os.environ.get("ECOHUB_TIKTOK_TIMEOUT_SEC") or "").strip(),
            },
            "resolved_credentials": {
                "source": current_credentials.get("source") or "",
                "app_key": current_credentials.get("app_key") or "",
                "merchant_id": current_credentials.get("merchant_id") or "",
                "shop_id": current_credentials.get("shop_id") or "",
                "shop_cipher_masked": _mask_secret(current_credentials.get("shop_cipher") or ""),
                "access_token_masked": _mask_secret(current_credentials.get("access_token") or ""),
                "refresh_token_masked": _mask_secret(current_credentials.get("refresh_token") or ""),
            },
        },
        "database": {
            "record_count": len(records),
            "latest": latest_row,
        },
    }
    return jsonify(data)


@app.route("/tiktok-auth/test-api", methods=["POST"])
def tiktok_auth_test_api():
    if "user" not in session:
        return redirect(url_for("login"))

    result = _run_tiktok_env_api_test()
    if result.get("ok"):
        flash("✅ TikTok API test thành công")
    else:
        flash("❌ TikTok API test thất bại", "error")
    if _is_admin_user():
        session["tiktok_api_test_result"] = result
    else:
        session.pop("tiktok_api_test_result", None)
    return redirect(url_for("tiktok_auth_page"))


@app.route("/tiktok-auth/select-shop", methods=["POST"])
def tiktok_auth_select_shop():
    if "user" not in session:
        return redirect(url_for("login"))

    auth_id_raw = (request.form.get("auth_id") or "").strip()
    if auth_id_raw.lower() in {"", "none", "clear", "auto"}:
        session.pop("tiktok_selected_auth_id", None)
        flash("✅ Đã chuyển sang chế độ tự dò toàn bộ shop đã ủy quyền.", "info")
        return redirect(url_for("tiktok_auth_page"))

    try:
        auth_id = int(auth_id_raw)
    except Exception:
        flash("❌ ID shop không hợp lệ.", "error")
        return redirect(url_for("tiktok_auth_page"))

    all_records = list_tiktok_authorizations(TIKTOK_AUTH_DB)
    selected = _find_tiktok_auth_record(all_records, auth_id)
    if not selected:
        flash("❌ Không tìm thấy cửa hàng đã ủy quyền với ID này.", "error")
        return redirect(url_for("tiktok_auth_page"))

    session["tiktok_selected_auth_id"] = auth_id
    flash("✅ Đã chọn shop hiện hành từ danh sách ủy quyền.", "success")
    return redirect(url_for("tiktok_auth_page"))


@app.route("/tiktok-auth/merchant-token", methods=["POST"])
def tiktok_auth_merchant_token():
    if "user" not in session:
        return redirect(url_for("login"))

    _load_local_env_file()
    merchant_id = (request.form.get("merchant_id") or os.environ.get("ECOHUB_TIKTOK_MERCHANT_ID") or "").strip()
    refresh_token = (request.form.get("refresh_token") or "").strip()
    if not merchant_id:
        flash("❌ Cần nhập merchant_id để lấy token theo merchant flow.", "error")
        return redirect(url_for("tiktok_auth_page"))

    exchange = _exchange_tiktok_merchant_token(merchant_id, refresh_token=refresh_token)
    access_token = str(exchange.get("access_token") or "").strip()
    metadata_exchange = _fetch_tiktok_shop_metadata(access_token) if access_token else {}
    metadata_fields = metadata_exchange.get("fields") or {} if isinstance(metadata_exchange, dict) else {}
    insert_tiktok_authorization(
        TIKTOK_AUTH_DB,
        merchant_id=str(metadata_fields.get("merchant_id") or merchant_id or ""),
        shop_id=str(metadata_fields.get("shop_id") or ""),
        shop_cipher=str(metadata_fields.get("shop_cipher") or ""),
        access_token=access_token,
        refresh_token=str(exchange.get("refresh_token") or refresh_token or ""),
        raw_query_json=json.dumps(
            {
                "merchant_id": merchant_id,
                "grant_type": "refresh_token" if refresh_token else "access_token",
            },
            ensure_ascii=False,
        ),
        raw_exchange_json=json.dumps(
            {
                "merchant_exchange": exchange,
                "metadata_exchange": metadata_exchange,
            },
            ensure_ascii=False,
        ),
    )

    if exchange.get("_error"):
        reason = str(exchange.get("_raw") or exchange.get("_error") or "").strip()
        if len(reason) > 220:
            reason = reason[:220] + "..."
        if reason:
            flash(f"❌ Merchant token lỗi: {reason}", "error")
        else:
            flash("❌ Merchant token lỗi. Kiểm tra cấu hình merchant_id/client credentials.", "error")
    else:
        flash("✅ Đã lấy và lưu merchant access token theo flow merchant/oauth/token.")
    return redirect(url_for("tiktok_auth_page"))


@app.route("/tiktok-auth/connect", methods=["GET"])
def tiktok_auth_connect():
    if "user" not in session:
        return redirect(url_for("login"))
    try:
        # Nạp lại .env khi bấm connect để tránh phải restart app mỗi lần chỉnh file env
        _load_local_env_file()
        state = secrets.token_urlsafe(24)
        session["tiktok_auth_state"] = state
        session["tiktok_auth_state_ts"] = int(time.time())
        states = session.get("tiktok_auth_states") or []
        if not isinstance(states, list):
            states = []
        states.append(state)
        # Giữ tối đa 10 state gần nhất để tránh callback lệch tab bị reject oan.
        session["tiktok_auth_states"] = states[-10:]
        return redirect(_build_tiktok_authorize_url(state))
    except Exception as e:
        flash(f"❌ Không tạo được link authorize TikTok: {e}", "error")
        return redirect(url_for("tiktok_auth_page"))


@app.route("/tiktok-auth/callback", methods=["GET"])
@app.route("/api/auth/tiktok/callback", methods=["GET"])
def tiktok_auth_callback():
    has_session_user = "user" in session
    if not has_session_user:
        # Không chặn sớm callback chỉ vì mất session đăng nhập.
        # Vẫn cố exchange/lưu token để tránh mất dữ liệu ủy quyền,
        # rồi mới yêu cầu người dùng đăng nhập lại ở cuối.
        print("[TIKTOK AUTH] Callback quay về khi không còn session user; vẫn tiếp tục exchange và lưu token.")

    state = (request.args.get("state") or "").strip()
    code = (request.args.get("code") or request.args.get("auth_code") or "").strip()
    merchant_id_qs = (request.args.get("merchant_id") or request.args.get("merchant") or "").strip()
    shop_id_qs = (request.args.get("shop_id") or "").strip()
    shop_cipher_qs = (request.args.get("shop_cipher") or "").strip()

    expected_state = (session.get("tiktok_auth_state") or "").strip()
    states = session.get("tiktok_auth_states") or []
    if not isinstance(states, list):
        states = []
    valid_states = {str(s).strip() for s in states if str(s).strip()}
    if expected_state:
        valid_states.add(expected_state)

    state_mismatch = False
    if not state:
        flash("❌ Callback không có state.", "error")
        return redirect(url_for("tiktok_auth_page" if has_session_user else "login"))
    if valid_states and state not in valid_states:
        # Không chặn cứng callback: vẫn thử exchange code để tránh mất refresh_token
        # khi session bị lệch host localhost/127.0.0.1 hoặc app vừa restart.
        state_mismatch = True
    if not code:
        flash("❌ Callback không có code", "error")
        return redirect(url_for("tiktok_auth_page" if has_session_user else "login"))

    callback_exchange = _exchange_tiktok_authorized_code(code)
    callback_token_fields = {}
    if isinstance(callback_exchange, dict):
        callback_token_fields = _extract_tiktok_token_fields(
            callback_exchange.get("_token_fields") or callback_exchange
        )

    merchant_id = str(
        callback_token_fields.get("merchant_id")
        or merchant_id_qs
        or (os.environ.get("ECOHUB_TIKTOK_MERCHANT_ID") or "").strip()
    ).strip()
    merchant_exchange: dict[str, Any] = {}
    token_fields: dict[str, Any] = dict(callback_token_fields)
    if merchant_id and not (str(token_fields.get("access_token") or "").strip()):
        merchant_exchange = _exchange_tiktok_merchant_token(
            merchant_id, str(token_fields.get("refresh_token") or "").strip()
        )
        if not merchant_exchange.get("_error"):
            m_fields = _extract_tiktok_token_fields(merchant_exchange)
            for k, v in m_fields.items():
                if v is not None and str(v).strip() and not (str(token_fields.get(k) or "").strip()):
                    token_fields[k] = v

    rt_only = str(token_fields.get("refresh_token") or "").strip()
    if rt_only and not (str(token_fields.get("access_token") or "").strip()):
        refreshed = _refresh_tiktok_access_token(rt_only)
        if not refreshed.get("_error"):
            r_fields = _extract_tiktok_token_fields(refreshed.get("_token_fields") or refreshed)
            for k, v in r_fields.items():
                if v is not None and str(v).strip():
                    token_fields[k] = v

    metadata_exchange: dict[str, Any] = {}
    access_for_metadata = str(token_fields.get("access_token") or "").strip()
    if access_for_metadata:
        metadata_exchange = _fetch_tiktok_shop_metadata(access_for_metadata)
        metadata_fields = metadata_exchange.get("fields") or {} if isinstance(metadata_exchange, dict) else {}
        for key in ("merchant_id", "shop_id", "shop_cipher"):
            current_val = str(token_fields.get(key) or "").strip()
            meta_val = str(metadata_fields.get(key) or "").strip()
            if meta_val and not current_val:
                token_fields[key] = meta_val
        if not merchant_id:
            merchant_id = str(token_fields.get("merchant_id") or "").strip()

    exchange = {
        "callback_exchange": callback_exchange,
        "merchant_exchange": merchant_exchange,
        "metadata_exchange": metadata_exchange,
    }

    insert_tiktok_authorization(
        TIKTOK_AUTH_DB,
        state=state,
        auth_code=code,
        merchant_id=merchant_id,
        shop_id=str(token_fields.get("shop_id") or shop_id_qs),
        shop_cipher=str(token_fields.get("shop_cipher") or shop_cipher_qs),
        access_token=str(token_fields.get("access_token") or ""),
        refresh_token=str(token_fields.get("refresh_token") or ""),
        raw_query_json=json.dumps(request.args.to_dict(flat=True), ensure_ascii=False),
        raw_exchange_json=json.dumps(exchange, ensure_ascii=False),
    )

    callback_error = ""
    if isinstance(callback_exchange, dict) and callback_exchange.get("_error"):
        callback_error = str(callback_exchange.get("_raw") or callback_exchange.get("_error") or "").strip()

    merchant_error = ""
    if isinstance(merchant_exchange, dict) and merchant_exchange.get("_error"):
        merchant_error = str(merchant_exchange.get("_raw") or merchant_exchange.get("_error") or "").strip()

    access_saved = (str(token_fields.get("access_token") or "").strip())
    refresh_saved = (str(token_fields.get("refresh_token") or "").strip())

    # Chỉ cảnh báo mismatch khi thực sự chưa lưu được token.
    # Trường hợp đã exchange/lưu thành công thì không cần hiện warning gây nhiễu.
    if state_mismatch and not (access_saved or refresh_saved):
        flash("⚠️ State callback không khớp session hiện tại, hãy bấm Kết nối lại TikTok rồi thử lại.", "error")

    if callback_error and not access_saved:
        if len(callback_error) > 180:
            callback_error = callback_error[:180] + "..."
        flash(f"⚠️ Callback có code nhưng exchange authorized_code lỗi: {callback_error}", "error")
    elif merchant_id and merchant_error and not access_saved:
        if len(merchant_error) > 180:
            merchant_error = merchant_error[:180] + "..."
        flash(f"⚠️ Đã nhận diện merchant_id={merchant_id}, nhưng lấy merchant token lỗi: {merchant_error}", "error")
    elif access_saved and refresh_saved:
        flash("✅ Đã exchange callback thành công và lưu access_token + refresh_token.")
    elif access_saved:
        flash("✅ Đã lưu access_token. (Refresh token có thể không có trong phản hồi — nên kết nối lại nếu hết hạn sớm.)")
    elif refresh_saved:
        flash(
            "⚠️ Đã lưu refresh_token nhưng vẫn chưa có access_token sau khi thử làm mới. "
            "Hãy bấm Kiểm tra kết nối hoặc Kết nối lại TikTok.",
            "error",
        )
    else:
        flash(
            "✅ Đã lưu callback. Nếu TikTok trả đủ dữ liệu token thì app đã lưu access/refresh token vào DB.",
        )

    if session.get("tiktok_auth_state") == state:
        session.pop("tiktok_auth_state", None)
    session.pop("tiktok_auth_state_ts", None)
    remain_states = [s for s in states if str(s).strip() != state]
    session["tiktok_auth_states"] = remain_states[-10:]
    if not has_session_user:
        if access_saved or refresh_saved:
            flash("✅ Đã lưu ủy quyền TikTok. Vui lòng đăng nhập lại để tiếp tục.", "info")
        else:
            flash("⚠️ Callback TikTok đã quay về nhưng phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.", "error")
        return redirect(url_for("login"))
    return redirect(url_for("tiktok_auth_page"))


@app.route("/record")
def record_page():
    if "user" not in session:
        return redirect(url_for("login"))
    return render_template("record.html", num_cameras=len(camera_managers))


@app.route("/camera-settings", methods=["GET", "POST"])
def camera_settings():
    """
    Cài đặt luồng stream: USB Webcam hoặc camera RTSP.
    """
    if "user" not in session:
        return redirect(url_for("login"))

    # Chỉ quét USB camera khi cần (để tránh warning không cần thiết)
    # Nếu tất cả camera đang dùng RTSP, không cần quét USB
    all_rtsp = all(cfg.get("source_type") == SOURCE_RTSP for cfg in camera_configs)
    available = [] if all_rtsp else scan_available_cameras()
    current_recording_camera_slot = _load_recording_camera_slot(camera_configs)

    if request.method == "POST":
        with state_lock:
            if app_state["is_recording"]:
                flash("Dang quay video, khong the doi cai dat camera.")
                return redirect(url_for("camera_settings"))

        employee_session = _normalize_employee_session(
            {
                "employee_name": request.form.get("employee_name"),
                "employee_code": request.form.get("employee_code"),
                "work_session_label": request.form.get("work_session_label"),
            }
        )

        # Chi them camera khi checkbox "enable_N" duoc gui. Dung 720p/20fps mac dinh.
        configs = []
        for i in range(MAX_CAMERAS):
            if request.form.get("enable_%d" % i) != "1":
                continue
            st = (request.form.get("source_type_%d" % i) or "").strip() or SOURCE_USB
            if st not in (SOURCE_USB, SOURCE_RTSP):
                st = SOURCE_USB
            rtp = (request.form.get("rtsp_url_%d" % i) or "").strip()
            if st == SOURCE_RTSP:
                if not rtp or not rtp.lower().startswith("rtsp"):
                    flash("Camera %d: URL RTSP phai bat dau bang rtsp://" % (i + 1))
                    return redirect(url_for("camera_settings"))
                cam_idx = 0
            else:
                try:
                    cam_idx = int(request.form.get("camera_index_%d" % i, 0))
                except (TypeError, ValueError):
                    cam_idx = 0
                if available and cam_idx not in available:
                    flash("Camera %d: khong ket noi duoc camera USB %d." % (i + 1, cam_idx))
                    return redirect(url_for("camera_settings"))
            configs.append({
                "slot_index": i,
                "source_type": st,
                "camera_index": cam_idx,
                "rtsp_url": rtp,
                "width": CameraManager.DEFAULT_WIDTH,
                "height": CameraManager.DEFAULT_HEIGHT,
                "fps": CameraManager.DEFAULT_FPS,
            })
        if not configs:
            configs = [_default_camera_config()]
            flash("Phai bat it nhat 1 camera.")
        recording_camera_slot = _normalize_recording_camera_slot(
            request.form.get("recording_camera_slot"),
            configs,
        )

        scan_sensitivity = (request.form.get("scan_sensitivity") or "").strip() or SENSITIVITY_NORMAL
        if scan_sensitivity not in (SENSITIVITY_LOW, SENSITIVITY_NORMAL, SENSITIVITY_HIGH):
            scan_sensitivity = SENSITIVITY_NORMAL
        interval_map = {SENSITIVITY_LOW: 0.1, SENSITIVITY_NORMAL: 0.05, SENSITIVITY_HIGH: 0.03}

        # Nhận cấu hình cooldown quét QR (giây)
        try:
            qr_cooldown_seconds = int(request.form.get("qr_cooldown_seconds", "5") or "5")
        except ValueError:
            qr_cooldown_seconds = 5
        if qr_cooldown_seconds < 1:
            qr_cooldown_seconds = 1
        if qr_cooldown_seconds > 60:
            qr_cooldown_seconds = 60
        
        # Nhận tùy chọn "Tự động quay khi quét QR"
        auto_record = True

        try:
            build_managers_and_scanners(
                configs,
                scan_interval_sec=interval_map[scan_sensitivity],
                sensitivity=scan_sensitivity,
                qr_cooldown_seconds=qr_cooldown_seconds,
                recording_camera_slot=recording_camera_slot,
            )
            camera_configs.clear()
            camera_configs.extend(configs)
            
            # Cập nhật app_state
            with state_lock:
                app_state["auto_record_on_qr"] = auto_record
            
            # Lưu cấu hình vào file JSON
            save_config(
                configs,
                scan_sensitivity,
                auto_record,
                qr_cooldown_seconds=qr_cooldown_seconds,
                employee_session=employee_session,
                recording_camera_slot=recording_camera_slot,
            )
            flash("Da ap dung cai dat camera (%d camera)." % len(configs))
        except RuntimeError as e:
            flash("Khong mo duoc camera: %s" % str(e))
        return redirect(url_for("camera_settings"))

    scan_interval_sec, scan_sensitivity = (0.05, SENSITIVITY_NORMAL)
    if ai_scanners:
        scan_interval_sec, scan_sensitivity = ai_scanners[0].get_sensitivity()
    primary = _primary_camera_manager
    
    # Lấy auto_record_on_qr từ app_state
    with state_lock:
        auto_record = True
    
    # Lấy qr_cooldown_seconds từ config
    _, _, _, _, _, _, qr_cooldown_seconds = load_config()
    raw_config = _read_json_config_safe()
    employee_session = _normalize_employee_session(raw_config.get("employee_session"))
    camera_configs_by_slot = [None] * MAX_CAMERAS
    for idx, cfg in enumerate(camera_configs):
        try:
            slot_index = int(cfg.get("slot_index", idx))
        except (TypeError, ValueError):
            slot_index = idx
        if 0 <= slot_index < MAX_CAMERAS:
            camera_configs_by_slot[slot_index] = cfg
    current_user = session.get("user") or {}
    if not employee_session.get("employee_name"):
        employee_session["employee_name"] = str(current_user.get("username") or "").strip()
    
    # Lấy camera status
    with camera_status_lock:
        cam_status = camera_status.copy()
    
    return render_template(
        "camera_settings.html",
        available_cameras=available,
        camera_configs=camera_configs,
        camera_configs_by_slot=camera_configs_by_slot,
        num_cameras=len(camera_configs),
        source_type=primary.source_type if primary else SOURCE_USB,
        current_index=primary.camera_index if primary else 0,
        current_rtsp_url=(primary.rtsp_url or "") if primary else "",
        current_width=primary.width if primary else CameraManager.DEFAULT_WIDTH,
        current_height=primary.height if primary else CameraManager.DEFAULT_HEIGHT,
        current_fps=primary.fps if primary else CameraManager.DEFAULT_FPS,
        is_running=primary.is_running if primary else False,
        scan_sensitivity=scan_sensitivity,
        scan_interval_sec=scan_interval_sec,
        qr_cooldown_seconds=qr_cooldown_seconds,
        auto_record_on_qr=auto_record,
        employee_session=employee_session,
        recording_camera_slot=current_recording_camera_slot,
        camera_status=cam_status,
        SOURCE_USB=SOURCE_USB,
        SOURCE_RTSP=SOURCE_RTSP,
        SENSITIVITY_LOW=SENSITIVITY_LOW,
        SENSITIVITY_NORMAL=SENSITIVITY_NORMAL,
        SENSITIVITY_HIGH=SENSITIVITY_HIGH,
        MAX_CAMERAS=MAX_CAMERAS,
    )


@app.route("/storage-settings", methods=["GET", "POST"])
def storage_settings():
    """Trang cài đặt lưu trữ (đang dùng local-only)."""
    if "user" not in session:
        return redirect(url_for("login"))
    
    if request.method == "POST":
        flash("Ứng dụng đang ở chế độ lưu local trên máy. Cấu hình S3 đã tạm tắt.", "info")
        return redirect(url_for("storage_page"))
    
    return render_template(
        "storage_settings.html",
        storage_mode=LOCAL_STORAGE_MODE,
        s3_config=None,
        videos_dir=VIDEOS_DIR,
    )


@app.route("/delete-s3-account", methods=["POST"])
def delete_s3_account():
    """Giữ compatibility cho UI cũ; S3 hiện đã tạm tắt."""
    if "user" not in session:
        return jsonify({"success": False, "message": "Chưa đăng nhập"}), 401
    
    try:
        s3_service.config = None
        return jsonify({"success": True, "message": "S3 đang tạm tắt. EcoHub hiện lưu video local trên máy."})
    except Exception as e:
        return jsonify({"success": False, "message": f"Lỗi: {str(e)}"})


@app.route("/test-s3-connection", methods=["POST"])
def test_s3_connection():
    """Giữ compatibility cho UI cũ; S3 hiện đã tạm tắt."""
    if "user" not in session:
        return jsonify({"success": False, "message": "Chưa đăng nhập"}), 401
    return jsonify({"success": False, "message": "S3 đang tạm tắt. EcoHub hiện dùng local-only mode."})


@app.route("/upload-status", methods=["GET"])
def get_upload_status():
    """
    API: Lấy danh sách video local và trạng thái xử lý nội bộ
    """
    if "user" not in session:
        return jsonify({"error": "Chưa đăng nhập"}), 401
    
    try:
        # Tự động quét và đưa video local vào queue
        _auto_queue_local_videos()
        
        local_videos = []
        processed_files = set()
        
        # 1. Lấy TẤT CẢ tasks từ upload_status_dict (bao gồm cả videos đã upload thành công)
        with upload_status_lock:
            for filename, task in upload_status_dict.items():
                file_path = os.path.join(VIDEOS_DIR, filename)
                
                # Lấy size từ file nếu còn tồn tại, nếu không thì ước tính
                if os.path.exists(file_path):
                    file_size = os.path.getsize(file_path)
                    size_mb = round(file_size / (1024 * 1024), 2)
                else:
                    # File đã xóa (đã upload thành công) → ước tính size
                    size_mb = 0.0
                
                local_videos.append({
                    "filename": filename,
                    "size_mb": size_mb,
                    "created_at": task.created_at.strftime("%d/%m/%Y %H:%M:%S"),  # GMT+7
                    "status": task.status,
                    "error_msg": task.error_msg,
                })
                processed_files.add(filename)
        
        # 2. Quét thêm video local chưa có trong upload_status_dict
        if os.path.exists(VIDEOS_DIR):
            for filename in os.listdir(VIDEOS_DIR):
                if filename.endswith(('.mp4', '.avi')) and filename not in processed_files:
                    file_path = os.path.join(VIDEOS_DIR, filename)
                    file_size = os.path.getsize(file_path)
                    file_timestamp = os.path.getctime(file_path)
                    created_time = datetime.fromtimestamp(file_timestamp, tz=GMT7)
                    
                    local_videos.append({
                        "filename": filename,
                        "size_mb": round(file_size / (1024 * 1024), 2),
                        "created_at": created_time.strftime("%d/%m/%Y %H:%M:%S"),
                        "status": "not_queued",
                        "error_msg": "Chưa được đưa vào hàng đợi upload",
                    })
        
        # Sắp xếp theo thời gian (mới nhất trên cùng)
        local_videos.sort(key=lambda x: x["created_at"], reverse=True)
        
        return jsonify({
            "success": True,
            "queue_size": upload_queue.qsize(),
            "local_videos": local_videos,
        })
    
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})


@app.route("/api/video_storage_usage", methods=["GET"])
def api_video_storage_usage():
    """
    API: Trả về số liệu sử dụng dung lượng video (global hoặc theo shop).
    Dùng cho dashboard và kiểm thử.

    Query: shop_id (optional) – nếu có thì lấy usage theo shop; không có thì global.
    """
    if "user" not in session:
        return jsonify({"error": "Chưa đăng nhập"}), 401

    try:
        shop_id = request.args.get("shop_id")
        if shop_id == "":
            shop_id = None
        usage = get_video_storage_usage(shop_id)
        return jsonify({"success": True, "usage": usage})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/storage")
def storage_page():
    if "user" not in session:
        return redirect(url_for("login"))
    
    # Quét video local và tự động đưa vào worker để cập nhật trạng thái xử lý nội bộ.
    _auto_queue_local_videos()
    
    # Đọc video local trực tiếp từ thư mục lưu trữ.
    try:
        videos_info, total_size = storage_service.get_videos_info(VIDEOS_DIR)
        limits = get_global_video_limits()
        limit_gb = float(limits.get("storage_limit_gb") or 0.0)
        max_bytes = int(limit_gb * 1024 * 1024 * 1024) if limit_gb > 0 else 0
        status = storage_service.get_storage_status(total_size, max_bytes)
    except Exception as e:
        print(f"[STORAGE ERROR] Error getting local storage info: {e}")
        flash(f"❌ Lỗi đọc kho local: {str(e)}", "error")
        videos_info = []
        total_size = 0
        max_bytes = 0
        status = "Lỗi đọc dữ liệu"
    
    # Lấy tên file đang được ghi (nếu có)
    recording_filename = None
    if recorder.is_recording and recorder.file_path:
        recording_filename = os.path.basename(recorder.file_path)

    return render_template(
        "storage.html",
        videos=videos_info,
        total_size=total_size,
        max_size=max_bytes,
        status=status,
        recording_filename=recording_filename,
        storage_mode=LOCAL_STORAGE_MODE,
    )


@app.route("/storage/delete/<path:filename>", methods=["POST"])
def delete_video(filename):
    if "user" not in session:
        return redirect(url_for("login"))
    
    # Kiểm tra xem file có đang được ghi video không
    if recorder.is_recording and recorder.file_path:
        recording_filename = os.path.basename(recorder.file_path)
        if recording_filename == filename:
            flash(f"❌ Không thể xóa video '{filename}' vì đang quay video này. Vui lòng dừng quay trước.", "error")
            return redirect(url_for("storage_page"))
    
    try:
        file_path = os.path.join(VIDEOS_DIR, filename)
        normalized_target = os.path.normcase(os.path.normpath(file_path))
        matched_video_id = None

        for video in list_active_videos_for_shop(VIDEO_METADATA_DB, None):
            current_path = os.path.normcase(os.path.normpath(video.file_path or ""))
            if current_path == normalized_target or os.path.basename(current_path) == filename:
                matched_video_id = int(video.id) if video.id is not None else None
                break

        storage_service.delete_video(VIDEOS_DIR, filename)

        try:
            user = session.get("user", {}).get("username", "unknown")
        except Exception:
            user = "unknown"

        if matched_video_id is not None:
            try:
                mark_deleted(VIDEO_METADATA_DB, matched_video_id)
            except Exception as mark_e:
                print(f"[VIDEO LOG] Error marking local delete for '{filename}': {mark_e}")

        try:
            log_video_deletion(
                db_path=VIDEO_METADATA_DB,
                video_id=matched_video_id,
                shop_id=None,
                file_path=file_path,
                reason="manual_local_delete",
                trigger="admin_action",
                deleted_by=user,
            )
        except Exception as log_e:
            print(f"[VIDEO LOG] Error logging manual local delete for '{filename}': {log_e}")

        flash(f"✅ Đã xóa video local: {filename}")
    except Exception as e:
        flash(f"❌ Lỗi khi xóa video: {str(e)}", "error")
    
    return redirect(url_for("storage_page"))


@app.route("/test_camera", methods=["POST"])
def test_camera():
    """
    Test xem camera có khả dụng không (KHÔNG khởi động camera).
    """
    if "user" not in session:
        return jsonify({"success": False, "message": "Chưa đăng nhập"}), 401
    import cv2
    
    try:
        # Load config
        saved_configs, _, _, _, _, _, _ = load_config()
        if not saved_configs:
            saved_configs = [_default_camera_config()]
        recording_camera_slot = _load_recording_camera_slot(saved_configs)
        first_cam_config = saved_configs[0]
        selected_cam_config = first_cam_config
        for idx, cfg in enumerate(saved_configs):
            try:
                slot_index = int(cfg.get("slot_index", idx))
            except (TypeError, ValueError):
                slot_index = idx
            if slot_index == recording_camera_slot:
                selected_cam_config = cfg
                break
        source_type = selected_cam_config.get("source_type", SOURCE_USB)
        
        # Test camera
        if source_type == SOURCE_RTSP:
            rtsp_url = selected_cam_config.get("rtsp_url", "")
            if not rtsp_url:
                raise ValueError("RTSP URL is empty")
            cap = cv2.VideoCapture(rtsp_url)
        else:
            camera_index = selected_cam_config.get("camera_index", 0)
            cap = cv2.VideoCapture(camera_index)
        
        # Thử đọc 1 frame
        if not cap.isOpened():
            raise RuntimeError("Cannot open camera")
        
        ret, frame = cap.read()
        cap.release()
        
        if not ret or frame is None:
            raise RuntimeError("Cannot read frame from camera")
        
        # Test OK
        with camera_status_lock:
            camera_status["last_test"] = datetime.now(GMT7).strftime("%Y-%m-%d %H:%M:%S")
            camera_status["error"] = None
        
        return jsonify({
            "success": True,
            "message": f"Camera quay OK (Camera {recording_camera_slot + 1}, {source_type})",
            "source_type": source_type,
            "recording_camera_slot": recording_camera_slot,
            "config": selected_cam_config
        })
        
    except Exception as e:
        with camera_status_lock:
            camera_status["last_test"] = datetime.now(GMT7).strftime("%Y-%m-%d %H:%M:%S")
            camera_status["error"] = str(e)
        
        return jsonify({
            "success": False,
            "error": str(e)
        }), 400


@app.route("/start_cameras", methods=["POST"])
def start_cameras():
    """
    Khởi động cameras và AI scanners (sau khi test OK).
    """
    if "user" not in session:
        return jsonify({"success": False, "message": "Chưa đăng nhập"}), 401
    try:
        # Load config
        saved_configs, saved_sensitivity, saved_interval, saved_auto_record, _, saved_s3_config, saved_qr_cooldown = load_config()
        recording_camera_slot = _load_recording_camera_slot(saved_configs)
        
        if not saved_configs:
            saved_configs = [_default_camera_config()]
        
        # Build and start cameras
        print("[START CAMERAS] Building camera managers...")
        build_managers_and_scanners(
            saved_configs,
            scan_interval_sec=saved_interval,
            sensitivity=saved_sensitivity,
            qr_cooldown_seconds=saved_qr_cooldown,
            recording_camera_slot=recording_camera_slot,
        )
        
        camera_configs.clear()
        camera_configs.extend(saved_configs)
        
        # Load settings
        with state_lock:
            app_state["auto_record_on_qr"] = saved_auto_record
        
        # Local-only mode: luôn bỏ qua cấu hình S3 nếu có.
        s3_service.config = None
        if saved_s3_config:
            print("[START CAMERAS] Ignored saved S3 config because local-only mode is active.")
        
        # Start all cameras and AI scanners
        for i, mgr in enumerate(camera_managers):
            if not mgr.is_running:
                mgr.start()
                print(f"[START CAMERAS] Started camera {i}")
        
        for sc in ai_scanners:
            if not sc._running:
                sc.start()
                print(f"[START CAMERAS] Started AI scanner")
        
        # Update status
        with camera_status_lock:
            camera_status["initialized"] = True
            camera_status["running"] = True
            camera_status["error"] = None
        
        print(f"[START CAMERAS] Successfully started {len(camera_managers)} camera(s)")
        
        return jsonify({
            "success": True,
            "message": f"Started {len(camera_managers)} camera(s)",
            "num_cameras": len(camera_managers)
        })
        
    except Exception as e:
        print(f"[START CAMERAS] Error: {e}")
        
        with camera_status_lock:
            camera_status["initialized"] = False
            camera_status["running"] = False
            camera_status["error"] = str(e)
        
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


@app.route("/stop_cameras", methods=["POST"])
def stop_cameras():
    """
    Dừng tất cả cameras và AI scanners.
    """
    if "user" not in session:
        return jsonify({"success": False, "message": "Chưa đăng nhập"}), 401
    try:
        for mgr in camera_managers:
            mgr.stop()
        
        for sc in ai_scanners:
            sc.stop()
        
        with camera_status_lock:
            camera_status["running"] = False
            camera_status["error"] = None
        
        print("[STOP CAMERAS] All cameras stopped")
        
        return jsonify({
            "success": True,
            "message": "All cameras stopped"
        })
        
    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


@app.route("/camera_status")
def get_camera_status():
    """
    Lấy trạng thái camera hiện tại.
    """
    with camera_status_lock:
        return jsonify(camera_status)


@app.route("/video_feed")
@app.route("/video_feed/<int:index>")
def video_feed(index=0):
    """
    Stream MJPEG từ camera thứ index (0, 1, ...). Nhiều camera quét cùng lúc.
    """
    from camera.camera_stream import generate_mjpeg

    if index < 0 or index >= len(camera_managers):
        return "", 404
    return app.response_class(
        generate_mjpeg(camera_managers[index], ai_scanners[index]),
        mimetype="multipart/x-mixed-replace; boundary=frame",
    )


@app.route("/status")
def status():
    """
    Endpoint để frontend poll trạng thái realtime (mã đơn, đơn hàng, quay video).
    """
    with state_lock:
        is_recording = app_state["is_recording"]
        start = app_state["recording_start"]
        current_order_code = app_state["current_order_code"]
        order_info = app_state["current_order_info"]
        is_paused = app_state.get("is_paused", False)
        serial_state = app_state.get("serial_state") or {}
        packing_evaluation = app_state.get("packing_evaluation")
        notifications = list(app_state.get("notifications") or [])
        # Clear sau khi đã lấy để không show lặp lại
        app_state["notifications"] = []

    now = time.time()
    recording_seconds = int(now - start) if is_recording and start else 0

    # Tính tổng số lượng sản phẩm trong đơn hiện tại (nếu có)
    total_items = 0
    if order_info and isinstance(order_info, dict):
        try:
            items = order_info.get("items") or []
            total_items = sum(int((it or {}).get("qty", 0) or 0) for it in items)
        except Exception:
            total_items = 0

    return jsonify(
        {
            "is_recording": is_recording,
            "recording_seconds": recording_seconds,
            "current_order_code": current_order_code,
            "order_info": order_info,
            "is_paused": is_paused,
            "total_items": total_items,
            "num_cameras": len(camera_managers),
            # serial_state_raw: POC chỉ có 1 bucket "__all__", FE không dùng trực tiếp
            # nhưng giữ lại để dễ debug hoặc hiển thị chi tiết sau này.
            "serial_state": {
                key: {
                    "required_qty": int((state or {}).get("required_qty", 0) or 0),
                    "scanned_count": len((state or {}).get("scanned_serials") or []),
                }
                for key, state in serial_state.items()
            },
            # packing_state: thông tin đã được tính sẵn để FE render bảng trạng thái đóng gói.
            "packing_state": packing_evaluation,
            "notifications": notifications,
            "order_audio_nonce": int(app_state.get("order_audio_nonce") or 0),
            # tiktok: FE đọc TTS chi tiết đơn; generic (Shopee/Lazada/...): chỉ âm báo bắt đầu quét/ghi.
            "order_platform": order_service.get_order_platform(),
            "recording_flow": _get_recording_flow(),
            "recording_flow_label": storage_service.recording_flow_label(_get_recording_flow()),
        }
    )


def _trigger_auto_recording(code: str):
    """
    Helper function để tự động bắt đầu quay video (gọi từ on_code_detected).
    """
    try:
        # Không auto-start nếu camera chưa chạy (giống logic start_recording)
        with camera_status_lock:
            if not camera_status.get("running", False):
                with state_lock:
                    _push_notification("❌ Camera chưa khởi động, không thể auto quay", "error")
                return

        # Dùng chung core logic với start_recording
        _start_recording_internal(code, auto=True)
    except Exception as e:
        print(f"[AUTO-RECORD] Loi khi tu dong quay: {e}")
        import traceback
        traceback.print_exc()


@app.route("/start_recording", methods=["POST"])
def start_recording():
    """
    Bắt đầu quay video. Nếu chưa quét mã thì dùng mã tạm.
    """
    if "user" not in session:
        return jsonify({"error": "Chưa đăng nhập"}), 401

    # Check if camera is running
    with camera_status_lock:
        if not camera_status.get("running", False):
            return jsonify({"error": "Camera chưa khởi động! Vui lòng Start Camera trước."}), 400

    try:
        # Nếu đã quay thì không tạo phiên mới
        with state_lock:
            if app_state["is_recording"]:
                return jsonify({"ok": True, "message": "Đang quay"}), 200

        # Sử dụng mã đơn hiện tại (nếu có), nếu không thì tạo mã tạm
        code = None
        with state_lock:
            code = app_state.get("current_order_code")
        if code is None:
            code = "recording_" + str(int(time.time()))

        # Gọi chung logic bắt đầu quay (dùng chung cho auto-record và manual)
        result = _start_recording_internal(code, auto=False)
        if not result.get("ok"):
            # Nếu có lý do đặc biệt, trả về cho FE (hiện tại chỉ có already_recording)
            return jsonify({"error": result.get("reason", "Không thể bắt đầu quay")}), 400

        return jsonify({"ok": True})
    except Exception as e:
        import traceback
        error_msg = str(e)
        print("=" * 60)
        print("LOI KHI BAT DAU QUAY VIDEO:")
        print(f"Error: {error_msg}")
        print("Traceback:")
        traceback.print_exc()
        print("=" * 60)
        with state_lock:
            app_state["recording_order_code"] = None
        return jsonify({"error": error_msg}), 500


def _start_recording_internal(code: str, auto: bool = False) -> dict:
    """
    Core logic bắt đầu quay video.
    - Tạo file mới
    - Luôn giữ AI QR scanner chạy (vẫn đọc mã đơn trong lúc quay)
    - Gọi recorder.start(...)
    - Cập nhật app_state
    """
    try:
        with state_lock:
            if app_state["is_recording"]:
                return {"ok": False, "reason": "already_recording"}
            # Ghi nhận mã đơn gắn với video
            app_state["recording_order_code"] = code
            recording_entry = _queue_find_entry_by_code(code)
            app_state["recording_order_id"] = (recording_entry or {}).get("id")
            app_state["is_paused"] = False

        employee_session = _get_active_employee_session()
        recording_flow = _get_recording_flow()
        with state_lock:
            app_state["recording_flow"] = recording_flow
        video_path = storage_service.start_new_recording(
            VIDEOS_DIR,
            code,
            employee_code=employee_session.get("employee_code") or "",
            employee_name=employee_session.get("employee_name") or "",
            work_session_label=employee_session.get("work_session_label") or "",
            recording_flow=recording_flow,
        )

        primary = _primary_camera_manager
        w = (primary.width if primary else 1280) or 1280
        h = (primary.height if primary else 720) or 720
        if w < 320:
            w = 1280
        if h < 240:
            h = 720
        frame_size = (int(w), int(h))

        if not auto:
            print(
                f"[DEBUG app.py] primary camera: width={primary.width if primary else 'None'}, "
                f"height={primary.height if primary else 'None'}"
            )
            print(f"[DEBUG app.py] frame_size truyen vao recorder: {frame_size}")
            print(f"[DEBUG app.py] recorder.is_recording truoc khi start: {recorder.is_recording}")

        print("[INFO] AI QR scanner vẫn chạy trong lúc quay de doc ma don (khong pause).")
        for scanner in ai_scanners:
            if scanner:
                scanner.resume()

        # Đồng bộ camera và recorder về 10 FPS để giảm tải nhưng vẫn giữ thời gian phát đúng realtime.
        print(f"[INFO] Starting ASYNC recorder (FPS=7 sampled realtime, size={frame_size})")
        print(f"[INFO] Recorder has SEPARATE THREAD with compact buffer")
        recorder.start(video_path, frame_size=frame_size, fps=7.0)

        # Cập nhật path thực tế nếu recorder đổi extension (mp4 -> avi)
        if recorder.file_path and recorder.file_path != video_path:
            storage_service.update_recording_path(code, recorder.file_path)

        with state_lock:
            app_state["is_recording"] = True
            app_state["recording_start"] = time.time()

        if auto:
            print(f"[AUTO-RECORD] Da bat dau quay tu dong cho QR: {code}")

        return {"ok": True, "code": code}
    except Exception as e:
        print(f"[START RECORD] Loi khi bat dau quay: {e}")
        import traceback

        traceback.print_exc()
        with state_lock:
            app_state["recording_order_code"] = None
            app_state["recording_order_id"] = None
        return {"ok": False, "reason": str(e)}


def _compress_recorded_video(source_path: str | None, order_code: str | None = None) -> str | None:
    if not source_path or not os.path.exists(source_path):
        return source_path

    base_name, source_ext = os.path.splitext(source_path)
    compressed_path = base_name + "_h264.mp4"

    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        source_path,
        "-an",
        "-vf",
        "fps=7",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "30",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        compressed_path,
    ]

    try:
        original_size = os.path.getsize(source_path)
        subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if not os.path.exists(compressed_path):
            return source_path

        compressed_size = os.path.getsize(compressed_path)
        if compressed_size >= original_size:
            os.remove(compressed_path)
            print(
                "[VIDEO COMPRESS] Keep original file because H.264 output is not smaller "
                f"({compressed_size / (1024 * 1024):.1f} MB >= {original_size / (1024 * 1024):.1f} MB)"
            )
            return source_path

        final_path = source_path
        if source_ext.lower() != ".mp4":
            final_path = base_name + ".mp4"
            if os.path.exists(final_path):
                os.remove(final_path)

        os.replace(compressed_path, final_path)
        if final_path != source_path and os.path.exists(source_path):
            os.remove(source_path)

        if order_code:
            storage_service.update_recording_path(order_code, final_path)

        print(
            "[VIDEO COMPRESS] H.264 re-encode complete: "
            f"{original_size / (1024 * 1024):.1f} MB -> {compressed_size / (1024 * 1024):.1f} MB"
        )
        return final_path
    except FileNotFoundError:
        print("[VIDEO COMPRESS] Skip H.264 re-encode because ffmpeg is not available")
    except Exception as e:
        print(f"[VIDEO COMPRESS] H.264 re-encode failed: {e}")
    finally:
        if os.path.exists(compressed_path):
            try:
                os.remove(compressed_path)
            except Exception:
                pass

    return source_path


def _stop_recording_internal(
    advance_after_stop: bool = True,
    allow_incomplete_serial_stop: bool = False,
) -> dict:
    with state_lock:
        if not app_state["is_recording"]:
            return {"ok": True, "message": "Không ở trạng thái quay", "duration": 0}
        start = app_state["recording_start"]
        code = app_state.get("recording_order_code") or app_state["current_order_code"]
        recording_order_id = app_state.get("recording_order_id")
        recorded_entry = _queue_find_entry_by_id(recording_order_id)
        if not recorded_entry and code:
            recorded_entry = _queue_find_entry_by_code(code)
            recording_order_id = (recorded_entry or {}).get("id")
        order_info = (recorded_entry or {}).get("order_info") or app_state.get("current_order_info")
        serial_state = (recorded_entry or {}).get("serial_state") or app_state.get("serial_state") or {}

    blocked, block_msg, packing_evaluation = _packing_blocks_stop(order_info, serial_state)
    if blocked and not allow_incomplete_serial_stop:
        return {
            "ok": False,
            "error": block_msg,
            "packing_state": packing_evaluation,
            "duration": 0,
        }

    duration = recorder.stop()
    video_path = recorder.file_path  # Lưu path trước khi reset
    order_code = code or "unknown"
    video_path = _compress_recorded_video(video_path, order_code=code)
    if code:
        finalized_path = storage_service.finish_recording_for_order(code, duration_seconds=duration)
        if finalized_path:
            video_path = finalized_path

    # Ghi metadata video (local) để phục vụ tính dung lượng / auto cleanup sau này.
    video_id = None
    try:
        size_bytes = 0
        if video_path and os.path.exists(video_path):
            size_bytes = os.path.getsize(video_path)
        video_id = insert_video(
            db_path=VIDEO_METADATA_DB,
            shop_id=(order_info.get("shop_id") if isinstance(order_info, dict) else None),
            order_id=order_code,
            file_path=video_path or "",
            size_bytes=size_bytes,
            duration_sec=int(duration or 0),
            is_uploaded=False,
            is_disputed=False,
        )
        print(f"[VIDEO META] Inserted metadata for video_id={video_id}, path={video_path}, size={size_bytes}")
    except Exception as meta_e:
        print(f"[VIDEO META] Error inserting video metadata: {meta_e}")


    # Sau khi quay xong:
    # - reset trạng thái ghi
    # - với luồng hiện tại, xóa order vừa quay khỏi phiên hiện tại
    with state_lock:
        app_state["is_recording"] = False
        app_state["recording_start"] = None
        app_state["recording_order_code"] = None
        app_state["recording_order_id"] = None
        app_state["is_paused"] = False

        current_order_id = app_state.get("current_order_id")
        if recording_order_id:
            _queue_remove_entry_by_id(recording_order_id)

        if advance_after_stop:
            if current_order_id == recording_order_id:
                _queue_advance_to_next()
            elif current_order_id and _queue_find_entry_by_id(current_order_id):
                _queue_set_current(current_order_id)
            else:
                _queue_advance_to_next()

    # Reset tat ca scanner, CLEAR QUEUE cu va RESUME scanner
    print("[INFO] RESUME AI scanner and CLEAR QUEUE after stopping record...")
    for sc in ai_scanners:
        sc.reset()
        sc.resume()  # Resume (tiếp tục quét)
    
    # CLEAR TOÀN BỘ camera buffers để load video mới ngay lập tức
    print("[INFO] CLEAR camera buffers and reload fresh frames...")
    for mgr in camera_managers:
        if mgr:
            # 1. Clear frame queue (AI thread buffer)
            if hasattr(mgr, '_frame_queue'):
                queue_size = mgr._frame_queue.qsize()
                while not mgr._frame_queue.empty():
                    try:
                        mgr._frame_queue.get_nowait()
                    except:
                        break
                if queue_size > 0:
                    print(f"[CLEAR QUEUE] Cleared {queue_size} old frames from AI queue")
            
            # 2. Clear _latest_frame (display buffer)
            if hasattr(mgr, '_lock') and hasattr(mgr, '_latest_frame'):
                with mgr._lock:
                    mgr._latest_frame = None
                print(f"[CLEAR BUFFER] Cleared display frame buffer")
    
    # 3. Chờ camera thread đọc frames mới (1 frame cycle ~ 40ms @ 25fps)
    time.sleep(0.1)
    print(f"[RELOAD] Camera reloaded with fresh frames")

    # Đưa video vào upload queue để xử lý tuần tự
    if video_path and os.path.exists(video_path):
        filename = os.path.basename(video_path)
        task = UploadTask(
            filename=filename,
            path=video_path,
            order_code=order_code,
            status="pending",
            video_id=video_id,
        )
        
        with upload_status_lock:
            upload_status_dict[filename] = task
        
        upload_queue.put(task)
        print(f"[UPLOAD QUEUE] Added to queue: {filename} (queue size: {upload_queue.qsize()})")
    else:
        print(f"[WARNING] No video file to upload")

    # Sau khi ghi xong 1 video và đưa vào hàng đợi upload, kiểm tra giới hạn dung lượng.
    # Video mới quay chưa upload (is_uploaded=False) nên sẽ KHÔNG bị xóa trong lần cleanup này.
    try:
        enforce_video_storage_limit(None)
    except Exception as e:
        print(f"[STORAGE LIMIT] Error enforcing limit after stop_recording: {e}")

    return {
        "ok": True,
        "duration": duration,
        "message": "In xong",
        "forced_stop": bool(blocked and allow_incomplete_serial_stop),
        "packing_state": packing_evaluation,
    }


def _cancel_recording_internal(reset_current: bool = True) -> dict:
    """
    Hủy phiên quay hiện tại:
    - dừng recorder
    - xóa file video đang ghi
    - không lưu metadata, không enqueue upload
    - reset sạch order hiện tại để thao tác lại từ đầu
    """
    with state_lock:
        if not app_state["is_recording"]:
            if reset_current:
                _set_single_active_order(None)
            return {"ok": True, "message": "Không ở trạng thái quay", "discarded": False}
        code = app_state.get("recording_order_code") or app_state.get("current_order_code") or "unknown"
        recording_order_id = app_state.get("recording_order_id")

    duration = recorder.stop()
    video_path = recorder.file_path

    try:
        storage_service.cancel_recording_for_order(code, video_path)
    except Exception as e:
        print(f"[CANCEL RECORD] Loi xoa file quay dang dở: {e}")
        try:
            if video_path and os.path.exists(video_path):
                os.remove(video_path)
        except Exception:
            pass

    with state_lock:
        app_state["is_recording"] = False
        app_state["recording_start"] = None
        app_state["recording_order_code"] = None
        app_state["recording_order_id"] = None
        app_state["is_paused"] = False
        app_state["recent_serial_events"] = []
        if reset_current:
            _set_single_active_order(None)
        elif recording_order_id:
            _queue_remove_entry_by_id(recording_order_id)

    for sc in ai_scanners:
        sc.reset()
        sc.resume()

    for mgr in camera_managers:
        if mgr and hasattr(mgr, "_lock") and hasattr(mgr, "_latest_frame"):
            with mgr._lock:
                mgr._latest_frame = None

    time.sleep(0.05)
    print(f"[CANCEL RECORD] Huy video dang quay: {video_path} ({duration}s)")
    return {"ok": True, "duration": duration, "message": "Đã hủy phiên quay", "discarded": True}


@app.route("/stop_recording", methods=["POST"])
def stop_recording():
    """
    Dừng quay và hoàn tất lưu video local.
    """
    if "user" not in session:
        return jsonify({"error": "Chưa đăng nhập"}), 401

    allow_force_stop = (request.headers.get("X-EcoHub-Force-Stop") or "").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }
    result = _stop_recording_internal(
        advance_after_stop=True,
        allow_incomplete_serial_stop=allow_force_stop,
    )
    if not result.get("ok"):
        return jsonify(result), 400
    return jsonify(result)


@app.route("/pause_recording", methods=["POST"])
def pause_recording():
    """
    Tạm dừng ghi video (không đóng file, chỉ bỏ qua frame mới).
    """
    if "user" not in session:
        return jsonify({"error": "Chưa đăng nhập"}), 401

    with state_lock:
        if not app_state["is_recording"]:
            return jsonify({"error": "Không ở trạng thái quay"}), 400
        if app_state.get("is_paused"):
            return jsonify({"ok": True, "message": "Đã ở trạng thái tạm dừng"}), 200
        app_state["is_paused"] = True

    recorder.pause()
    return jsonify({"ok": True})


@app.route("/resume_recording", methods=["POST"])
def resume_recording():
    """
    Tiếp tục ghi video sau khi tạm dừng.
    """
    if "user" not in session:
        return jsonify({"error": "Chưa đăng nhập"}), 401

    with state_lock:
        if not app_state["is_recording"]:
            return jsonify({"error": "Không ở trạng thái quay"}), 400
        if not app_state.get("is_paused"):
            return jsonify({"ok": True, "message": "Đang ở trạng thái quay"}), 200
        app_state["is_paused"] = False

    recorder.resume()
    return jsonify({"ok": True})


def _cleanup_runtime_before_exit() -> None:
    try:
        if recorder.is_recording:
            recorder.stop()
    except Exception as e:
        print(f"[SHUTDOWN] Loi dung recorder: {e}")

    for sc in ai_scanners:
        try:
            sc.stop()
        except Exception as e:
            print(f"[SHUTDOWN] Loi dung AI scanner: {e}")

    for mgr in camera_managers:
        try:
            mgr.stop()
        except Exception as e:
            print(f"[SHUTDOWN] Loi dung camera manager: {e}")

    with camera_status_lock:
        camera_status["running"] = False
        camera_status["initialized"] = False
        camera_status["error"] = None


def _deferred_shutdown(shutdown_server=None, delay_sec: float = 0.6) -> None:
    global _shutdown_in_progress

    time.sleep(max(0.1, delay_sec))
    print("[SHUTDOWN] Dang tat EcoHub theo yeu cau tu web UI...")
    try:
        _cleanup_runtime_before_exit()
    finally:
        try:
            if callable(shutdown_server):
                shutdown_server()
        except Exception as e:
            print(f"[SHUTDOWN] Loi goi werkzeug shutdown: {e}")
        time.sleep(0.2)
        os._exit(0)


@app.route("/shutdown_app", methods=["POST"])
def shutdown_app():
    if "user" not in session:
        return jsonify({"error": "Chua dang nhap"}), 401

    global _shutdown_in_progress
    with state_lock:
        if _shutdown_in_progress:
            return jsonify({"ok": True, "message": "EcoHub dang tat..."}), 200
        _shutdown_in_progress = True

    shutdown_server = request.environ.get("werkzeug.server.shutdown")
    threading.Thread(
        target=_deferred_shutdown,
        args=(shutdown_server,),
        daemon=True,
    ).start()
    return jsonify({"ok": True, "message": "EcoHub dang tat..."})


@app.route("/reset_order", methods=["POST"])
def reset_order():
    """
    Cho phép reset mã đơn trong phiên hiện tại.
    """
    if "user" not in session:
        return jsonify({"error": "Chưa đăng nhập"}), 401

    with state_lock:
        is_recording = bool(app_state.get("is_recording", False))

    if is_recording:
        result = _cancel_recording_internal(reset_current=True)
        return jsonify(result)

    with state_lock:
        _set_single_active_order(None)
        app_state["recent_serial_events"] = []
    for sc in ai_scanners:
        sc.reset()
    return jsonify({"ok": True, "message": "Đã reset mã hiện tại", "discarded": False})


@app.route("/videos/<path:filename>")
def serve_video(filename):
    """
    Cho phép mở video local đã lưu trên máy.
    """
    safe_filename = os.path.basename(filename or "")
    if not safe_filename or safe_filename != filename:
        return jsonify({"error": "Tên file không hợp lệ"}), 400
    return send_from_directory(VIDEOS_DIR, safe_filename, as_attachment=False)


def _resolve_http_bind() -> tuple[str, int]:
    return _read_http_bind_from_env()


def _resolve_flask_debug() -> bool:
    raw = (os.environ.get("ECOHUB_FLASK_DEBUG") or "").strip().lower()
    if raw in ("0", "false", "no", "off"):
        return False
    if raw in ("1", "true", "yes", "on"):
        return True
    return not getattr(sys, "frozen", False)


def _should_open_browser_on_start() -> bool:
    raw = (os.environ.get("ECOHUB_OPEN_BROWSER") or "").strip().lower()
    if raw in ("0", "false", "no", "off"):
        return False
    if raw in ("1", "true", "yes", "on"):
        return True
    return bool(getattr(sys, "frozen", False))


def _schedule_open_browser(url: str, delay_sec: float = 1.6) -> None:
    def _open() -> None:
        try:
            import webbrowser

            webbrowser.open(url)
        except Exception as e:
            print(f"[BROWSER] Không mở được trình duyệt: {e}")

    timer = threading.Timer(delay_sec, _open)
    timer.daemon = True
    timer.start()


def _resolve_desktop_dir() -> str:
    """
    Lấy Desktop thật của user trên Windows.
    Fallback về ~/Desktop nếu không đọc được bằng shell API.
    """
    fallback = os.path.join(os.path.expanduser("~"), "Desktop")
    if sys.platform != "win32":
        return fallback
    try:
        import ctypes

        buf = ctypes.create_unicode_buffer(260)
        result = ctypes.windll.shell32.SHGetFolderPathW(None, 0x10, None, 0, buf)
        if result == 0 and buf.value:
            return buf.value
    except Exception as e:
        print(f"[SHORTCUT] Không lấy được Desktop path từ Windows shell: {e}")
    return fallback


def _ensure_desktop_shortcut_once() -> None:
    """
    Chỉ áp dụng cho bản exe:
    - Nếu Desktop chưa có EcoHub.lnk thì tạo 1 lần.
    - Nếu đã có thì bỏ qua, không ghi đè.
    """
    if not getattr(sys, "frozen", False):
        return
    if sys.platform != "win32":
        return

    try:
        exe_path = os.path.abspath(sys.executable)
        exe_dir = os.path.dirname(exe_path)
        desktop_dir = _resolve_desktop_dir()
        shortcut_path = os.path.join(desktop_dir, "EcoHub.lnk")

        if os.path.exists(shortcut_path):
            print(f"[SHORTCUT] Đã có shortcut sẵn: {shortcut_path}")
            return

        os.makedirs(desktop_dir, exist_ok=True)

        def _ps_quote(value: str) -> str:
            return "'" + (value or "").replace("'", "''") + "'"

        ps_script = (
            "$ws = New-Object -ComObject WScript.Shell;"
            f"$sc = $ws.CreateShortcut({_ps_quote(shortcut_path)});"
            f"$sc.TargetPath = {_ps_quote(exe_path)};"
            f"$sc.WorkingDirectory = {_ps_quote(exe_dir)};"
            f"$sc.IconLocation = {_ps_quote(exe_path + ',0')};"
            "$sc.Description = 'EcoHub';"
            "$sc.Save();"
        )

        subprocess.run(
            [
                "powershell",
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                ps_script,
            ],
            check=True,
            capture_output=True,
            text=True,
        )
        print(f"[SHORTCUT] Đã tạo shortcut Desktop: {shortcut_path}")
    except Exception as e:
        print(f"[SHORTCUT] Không tạo được shortcut Desktop: {e}")


if __name__ == "__main__":
    # QUEUE LOCAL VIDEOS: đưa video local vào worker để khôi phục trạng thái nội bộ sau restart.
    print("[STARTUP] Scanning local videos for storage worker...")
    try:
        video_dir = VIDEOS_DIR
        if os.path.exists(video_dir):
            queued_count = 0
            for filename in os.listdir(video_dir):
                if filename.endswith(('.mp4', '.avi')):
                    file_path = os.path.join(video_dir, filename)
                    
                    # Trích xuất order_code từ filename (format: {order_code}_{timestamp}.mp4)
                    order_code = "unknown"
                    try:
                        # Loại bỏ extension và timestamp
                        base_name = filename.replace('.mp4', '').replace('.avi', '')
                        parts = base_name.rsplit('_', 2)  # Split từ phải: [order_code, date, time]
                        if len(parts) >= 1:
                            order_code = parts[0]
                    except:
                        pass
                    
                    # Đưa vào queue
                    task = UploadTask(
                        filename=filename,
                        path=file_path,
                        order_code=order_code,
                        status="pending"
                    )
                    
                    with upload_status_lock:
                        upload_status_dict[filename] = task
                    
                    upload_queue.put(task)
                    queued_count += 1
                    print(f"[STARTUP] Queued for local finalize: {filename}")
            
            if queued_count > 0:
                print(f"[STARTUP] Queued {queued_count} local video(s) for storage processing")
            else:
                print("[STARTUP] No local videos found.")
    except Exception as e:
        print(f"[STARTUP] Error scanning local videos: {e}")
    
    # Load cấu hình từ file (KHÔNG TỰ ĐỘNG KHỞI ĐỘNG CAMERA)
    saved_configs, saved_sensitivity, saved_interval, saved_auto_record, saved_storage_mode, saved_s3_config, saved_qr_cooldown = load_config()
    
    # Tạm tắt S3: giữ local-only mode để video luôn nằm trên máy.
    s3_service.config = None
    if saved_s3_config:
        print("[STORAGE] S3 config found in config.json but is currently ignored (local-only mode).")
    else:
        print("[STORAGE] Local-only mode active.")
    
    # Load auto_record setting
    with state_lock:
        app_state["auto_record_on_qr"] = saved_auto_record
    
    # Lưu camera config (CHƯA khởi động)
    camera_configs.clear()
    camera_configs.extend(saved_configs if saved_configs else [_default_camera_config()])
    
    print(f"[STARTUP] Config loaded. Camera: {len(camera_configs)} (NOT STARTED YET)")
    print("[STARTUP] User will test and start cameras manually from dashboard")
    
    # Khởi động upload worker thread
    upload_thread = threading.Thread(target=upload_worker, daemon=True, name="UploadWorker")
    upload_thread.start()
    print("[UPLOAD WORKER] Upload worker thread started")

    # Khởi động worker tự động refresh TikTok token định kỳ.
    tiktok_refresh_thread = threading.Thread(
        target=_tiktok_token_auto_refresh_worker,
        daemon=True,
        name="TikTokTokenAutoRefreshWorker",
    )
    tiktok_refresh_thread.start()
    print("[TIKTOK AUTO REFRESH] Worker thread started")
    
    http_host, http_port = _resolve_http_bind()
    debug_mode = _resolve_flask_debug()

    print("\n" + "="*60)
    print("  ECOHUB QR SCANNER - READY")
    print("="*60)
    print(f"  URL: http://{http_host}:{http_port}")
    print(f"  Camera Status: NOT STARTED (manual start required)")
    print("  Storage Mode: LOCAL_ONLY")
    print("="*60 + "\n")

    base_url = f"http://{http_host}:{http_port}"

    _ensure_desktop_shortcut_once()

    # Mặc định không bật reloader để tránh 2 tiến trình Python / bind trùng port.
    # Muốn tự reload khi sửa file (dev): đặt ECOHUB_FLASK_USE_RELOADER=1
    use_reloader = (os.environ.get("ECOHUB_FLASK_USE_RELOADER") or "").strip().lower() in (
        "1",
        "true",
        "yes",
        "on",
    )

    # Tránh mở browser 2 lần khi Werkzeug reloader (chỉ child có WERKZEUG_RUN_MAIN=true).
    _browser_ok = os.environ.get("WERKZEUG_RUN_MAIN") == "true" or not use_reloader
    if _should_open_browser_on_start() and _browser_ok:
        _schedule_open_browser(base_url + "/")
        print(f"[BROWSER] Sẽ mở trình duyệt sau ~1.6s: {base_url}/")
    app.run(
        host=http_host,
        port=http_port,
        debug=debug_mode,
        use_reloader=use_reloader,
        threaded=True,
    )
