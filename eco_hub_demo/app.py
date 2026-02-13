import os
import threading
import time
import json
import sys
from datetime import datetime, timedelta, timezone

# Fix UTF-8 encoding cho Windows console
if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except:
        pass

# Tắt warning OpenCV không cần thiết (ví dụ: DSHOW camera not found)
os.environ["OPENCV_LOG_LEVEL"] = "ERROR"  # Chỉ hiện lỗi nghiêm trọng, ẩn warning

from flask import (
    Flask,
    render_template,
    request,
    redirect,
    url_for,
    session,
    jsonify,
    flash,
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


# ==========================
# CẤU HÌNH ỨNG DỤNG DEMO
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

# Data directory cho config và videos (writable)
if getattr(sys, 'frozen', False):
    # PyInstaller: Dùng user's app data directory
    DATA_DIR = os.path.join(os.path.expanduser('~'), 'EcoHub_QR_Scanner')
else:
    # Dev: Dùng project directory
    DATA_DIR = os.path.dirname(os.path.abspath(__file__))

VIDEOS_DIR = os.path.join(DATA_DIR, "videos")
CONFIG_FILE = os.path.join(DATA_DIR, "config.json")
CONFIG_KEY_FILE = os.path.join(DATA_DIR, "config.key")
os.makedirs(VIDEOS_DIR, exist_ok=True)
os.makedirs(DATA_DIR, exist_ok=True)

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
app.secret_key = "ecohub-demo-secret"

print(f"[STARTUP] BASE_DIR: {BASE_DIR}")
print(f"[STARTUP] Templates: {template_folder}")
print(f"[STARTUP] Static: {static_folder}")
print(f"[STARTUP] Videos: {VIDEOS_DIR}")


# ==========================
# UPLOAD QUEUE SYSTEM
# ==========================
from queue import Queue
from dataclasses import dataclass, field

# Timezone GMT+7 (Việt Nam)
GMT7 = timezone(timedelta(hours=7))

@dataclass
class UploadTask:
    """Thông tin video cần upload"""
    filename: str
    path: str
    order_code: str
    status: str = "pending"  # pending, uploading, success, failed
    error_msg: str = ""
    created_at: datetime = field(default_factory=lambda: datetime.now(GMT7))
    
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
        
        for filename in os.listdir(VIDEOS_DIR):
            if not filename.endswith(('.mp4', '.avi')):
                continue
            
            # Kiểm tra xem file này đã được đưa vào queue chưa
            with upload_status_lock:
                if filename in upload_status_dict:
                    # Đã có trong queue hoặc đang xử lý
                    continue
            
            # Trích xuất order_code từ filename
            file_path = os.path.join(VIDEOS_DIR, filename)
            order_code = "unknown"
            try:
                base_name = filename.replace('.mp4', '').replace('.avi', '')
                parts = base_name.rsplit('_', 2)
                if len(parts) >= 1:
                    order_code = parts[0]
            except:
                pass
            
            # Tạo task và đưa vào queue
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
            
            # Upload lên S3
            if s3_service.is_configured():
                try:
                    success, result = s3_service.upload_video(task.path, task.order_code)
                    
                    if success:
                        print(f"[UPLOAD WORKER] Success: {result}")
                        
                        # Cập nhật status = success
                        with upload_status_lock:
                            task.status = "success"
                            task.error_msg = ""
                            upload_status_dict[task.filename] = task
                        
                        # Xóa file local sau khi upload thành công
                        for attempt in range(3):
                            try:
                                if os.path.exists(task.path):
                                    os.remove(task.path)
                                    print(f"[UPLOAD WORKER] Deleted local file: {task.path}")
                                    break
                            except PermissionError:
                                if attempt < 2:
                                    print(f"[UPLOAD WORKER] Delete retry {attempt+1}/3")
                                    time.sleep(0.5)
                                else:
                                    print(f"[UPLOAD WORKER] ERROR: Cannot delete after 3 attempts")
                            except Exception as del_e:
                                print(f"[UPLOAD WORKER] ERROR: Delete failed: {str(del_e)}")
                                break
                        
                        # GIỮ LẠI trong upload_status_dict để hiển thị lịch sử cả ngày
                        # Sẽ tự động xóa vào 00:00 ngày hôm sau
                    else:
                        # Upload thất bại
                        print(f"[UPLOAD WORKER] Failed: {result}")
                        with upload_status_lock:
                            task.status = "failed"
                            task.error_msg = str(result)
                            upload_status_dict[task.filename] = task
                except Exception as upload_e:
                    print(f"[UPLOAD WORKER] Upload exception: {str(upload_e)}")
                    with upload_status_lock:
                        task.status = "failed"
                        task.error_msg = str(upload_e)
                        upload_status_dict[task.filename] = task
            else:
                # S3 chưa cấu hình
                print(f"[UPLOAD WORKER] S3 not configured for: {task.filename}")
                with upload_status_lock:
                    task.status = "failed"
                    task.error_msg = "S3 chua duoc cau hinh"
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
# TRẠNG THÁI TOÀN CỤC (DEMO)
# ==========================

state_lock = threading.Lock()
app_state = {
    "is_recording": False,
    "recording_start": None,
    "recording_order_code": None,
    "current_order_code": None,
    "current_order_info": None,
    "auto_record_on_qr": False,  # Tự động quay khi quét được QR
}


# ==========================
# NHIỀU CAMERA: CONFIG + MANAGERS + SCANNERS
# ==========================

def _default_camera_config():
    return {
        "source_type": SOURCE_USB,
        "camera_index": 0,
        "rtsp_url": "",
        "width": CameraManager.DEFAULT_WIDTH,
        "height": CameraManager.DEFAULT_HEIGHT,
        "fps": CameraManager.DEFAULT_FPS,
    }


def load_config():
    """
    Đọc cấu hình từ file config.json (nếu có).
    Trả về: (camera_configs, scan_sensitivity, scan_interval_sec, auto_record_on_qr, storage_mode, s3_config)
    """
    if not os.path.exists(CONFIG_FILE):
        return ([_default_camera_config()], SENSITIVITY_NORMAL, 0.05, False, "s3", None)
    try:
        with open(CONFIG_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        configs = data.get("camera_configs", [_default_camera_config()])
        sensitivity = data.get("scan_sensitivity", SENSITIVITY_NORMAL)
        auto_record = data.get("auto_record_on_qr", False)
        storage_mode = "s3"  # Luôn dùng S3
        
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
        
        return (configs, sensitivity, interval, auto_record, storage_mode, s3_config)
    except Exception as e:
        print("Loi doc config.json: %s" % str(e))
        return ([_default_camera_config()], SENSITIVITY_NORMAL, 0.05, False, "s3", None)


def save_config(configs, scan_sensitivity, auto_record_on_qr=False, storage_mode="s3", s3_config=None):
    """
    Ghi cấu hình vào file config.json.
    QUAN TRỌNG: Nếu s3_config = None, sẽ giữ lại s3_config hiện có trong file.
    """
    try:
        # Load config hiện tại để giữ lại s3_config nếu không truyền vào
        existing_s3_config = None
        if os.path.exists(CONFIG_FILE):
            try:
                with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                    existing_data = json.load(f)
                    if "s3_config" in existing_data:
                        existing_s3_config = existing_data["s3_config"]
            except:
                pass
        
        data = {
            "camera_configs": configs,
            "scan_sensitivity": scan_sensitivity,
            "auto_record_on_qr": auto_record_on_qr,
            "storage_mode": "s3",  # Luôn dùng S3
        }
        
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

# S3 Service cho upload video
s3_service = S3Service()

# Encryption cho sensitive data (use CONFIG_KEY_FILE from DATA_DIR)
encryptor = get_encryptor(CONFIG_KEY_FILE)


def on_code_detected(code: str):
    """Callback khi bất kỳ AI scanner nào (từ mọi camera) phát hiện mã. Chỉ lock 1 mã/phiên."""
    with state_lock:
        if app_state["current_order_code"] is not None:
            return
        app_state["current_order_code"] = code
        app_state["current_order_info"] = order_service.get_order(code)
        
        # Tự động bắt đầu quay video nếu bật tính năng
        should_auto_record = app_state.get("auto_record_on_qr", False)
        is_recording = app_state.get("is_recording", False)
    
    # Trigger auto-record (ngoài lock để tránh deadlock)
    if should_auto_record and not is_recording:
        print(f"[AUTO-RECORD] Phat hien QR '{code}', tu dong bat dau quay video...")
        # Gọi logic start_recording trong thread riêng
        def _auto_start():
            time.sleep(0.5)  # Đợi UI cập nhật
            try:
                # Gọi nội dung logic start_recording (không qua Flask route)
                _trigger_auto_recording(code)
            except Exception as e:
                print(f"[AUTO-RECORD] Loi: {e}")
        
        threading.Thread(target=_auto_start, daemon=True).start()


def build_managers_and_scanners(configs, scan_interval_sec=0.05, sensitivity=SENSITIVITY_NORMAL):
    """Dừng toàn bộ camera/scanner cũ, tạo mới theo configs. Recorder gắn vào manager đầu."""
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
        )
        ai_scanners.append(sc)
    if camera_managers:
        camera_managers[0].set_recorder(recorder)
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
        }


# ==========
# ROUTES
# ==========


@app.route("/", methods=["GET", "POST"])
def login():
    """
    Login mock: không xác thực thật, chỉ lưu username vào session.
    """
    if request.method == "POST":
        username = request.form.get("username") or "demo_user"
        session["user"] = {"username": username}
        return redirect(url_for("dashboard"))
    return render_template("login.html")


@app.route("/dashboard")
def dashboard():
    if "user" not in session:
        return redirect(url_for("login"))
    
    with camera_status_lock:
        cam_status = camera_status.copy()
    
    return render_template("dashboard.html", num_cameras=len(camera_managers), camera_status=cam_status)


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

    if request.method == "POST":
        with state_lock:
            if app_state["is_recording"]:
                flash("Dang quay video, khong the doi cai dat camera.")
                return redirect(url_for("camera_settings"))

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

        scan_sensitivity = (request.form.get("scan_sensitivity") or "").strip() or SENSITIVITY_NORMAL
        if scan_sensitivity not in (SENSITIVITY_LOW, SENSITIVITY_NORMAL, SENSITIVITY_HIGH):
            scan_sensitivity = SENSITIVITY_NORMAL
        interval_map = {SENSITIVITY_LOW: 0.1, SENSITIVITY_NORMAL: 0.05, SENSITIVITY_HIGH: 0.03}
        
        # Nhận tùy chọn "Tự động quay khi quét QR"
        auto_record = request.form.get("auto_record_on_qr") == "1"

        try:
            build_managers_and_scanners(
                configs,
                scan_interval_sec=interval_map[scan_sensitivity],
                sensitivity=scan_sensitivity,
            )
            camera_configs.clear()
            camera_configs.extend(configs)
            
            # Cập nhật app_state
            with state_lock:
                app_state["auto_record_on_qr"] = auto_record
            
            # Lưu cấu hình vào file JSON
            save_config(configs, scan_sensitivity, auto_record)
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
        auto_record = app_state.get("auto_record_on_qr", False)
    
    # Lấy camera status
    with camera_status_lock:
        cam_status = camera_status.copy()
    
    return render_template(
        "camera_settings.html",
        available_cameras=available,
        camera_configs=camera_configs,
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
        auto_record_on_qr=auto_record,
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
    """Cài đặt tài khoản S3"""
    if "user" not in session:
        return redirect(url_for("login"))
    
    if request.method == "POST":
        # Luôn lưu mode = s3
        storage_mode = "s3"
        
        # Load config hiện tại
        _, saved_sensitivity, _, saved_auto_record, _, existing_s3_config = load_config()
        
        # Lấy thông tin từ form
        new_endpoint = request.form.get("s3_endpoint", "").strip()
        new_access_key = request.form.get("s3_access_key", "").strip()
        new_secret_key = request.form.get("s3_secret_key", "").strip()
        new_bucket = request.form.get("s3_bucket", "").strip()
        new_region = request.form.get("s3_region", "").strip()
        new_prefix = request.form.get("s3_prefix", "").strip()
        
        # Nếu đã có config → merge với thông tin mới (chỉ update field có giá trị)
        if existing_s3_config:
            s3_config = S3Config(
                endpoint=new_endpoint if new_endpoint else existing_s3_config.endpoint,
                access_key=new_access_key if new_access_key else existing_s3_config.access_key,
                secret_key=new_secret_key if new_secret_key else existing_s3_config.secret_key,
                bucket=new_bucket if new_bucket else existing_s3_config.bucket,
                region=new_region if new_region else existing_s3_config.region,
                prefix=new_prefix,  # Luôn update prefix
            )
            
            # Kiểm tra xem có thay đổi gì không
            if not new_endpoint and not new_access_key and not new_secret_key and not new_bucket and not new_region:
                flash(f"✅ Đã cập nhật prefix: '{new_prefix if new_prefix else '(trống)'}'")
            else:
                flash(f"✅ Đã cập nhật tài khoản S3")
        else:
            # Tạo config mới (bắt buộc đầy đủ thông tin)
            s3_config = S3Config(
                endpoint=new_endpoint,
                access_key=new_access_key,
                secret_key=new_secret_key,
                bucket=new_bucket,
                region=new_region if new_region else "hn-2",
                prefix=new_prefix,
            )
            
            # Validate
            if not all([s3_config.endpoint, s3_config.access_key, s3_config.secret_key, s3_config.bucket]):
                flash("❌ Vui lòng điền đầy đủ thông tin S3 (Endpoint, Access Key, Secret Key, Bucket)", "error")
                return redirect(url_for("storage_settings"))
            
            flash(f"✅ Đã lưu tài khoản S3: {s3_config.bucket}")
        
        # Update s3_service
        s3_service.config = s3_config
        
        # Lưu config
        save_config(camera_configs, saved_sensitivity, saved_auto_record, storage_mode, s3_config)
        
        return redirect(url_for("storage_settings"))
    
    # GET - hiển thị form
    _, _, _, _, storage_mode, s3_config = load_config()
    
    return render_template(
        "storage_settings.html",
        storage_mode=storage_mode,
        s3_config=s3_config,
    )


@app.route("/delete-s3-account", methods=["POST"])
def delete_s3_account():
    """Xóa tài khoản S3"""
    if "user" not in session:
        return jsonify({"success": False, "message": "Chưa đăng nhập"}), 401
    
    try:
        # Load config và xóa S3
        _, saved_sensitivity, _, saved_auto_record, _, _ = load_config()
        save_config(camera_configs, saved_sensitivity, saved_auto_record, "s3", None)
        
        # Clear s3_service
        s3_service.config = None
        
        return jsonify({"success": True, "message": "Đã xóa tài khoản S3"})
    except Exception as e:
        return jsonify({"success": False, "message": f"Lỗi: {str(e)}"})


@app.route("/test-s3-connection", methods=["POST"])
def test_s3_connection():
    """Test kết nối S3"""
    if "user" not in session:
        return jsonify({"success": False, "message": "Chưa đăng nhập"}), 401
    
    try:
        # Tạo S3Config từ form
        test_config = S3Config(
            endpoint=request.form.get("s3_endpoint", "").strip(),
            access_key=request.form.get("s3_access_key", "").strip(),
            secret_key=request.form.get("s3_secret_key", "").strip(),
            bucket=request.form.get("s3_bucket", "").strip(),
            region=request.form.get("s3_region", "hn-2").strip(),
            prefix=request.form.get("s3_prefix", "").strip(),
        )
        
        # Test connection
        test_service = S3Service(test_config)
        success, message = test_service.test_connection()
        
        return jsonify({"success": success, "message": message})
    
    except Exception as e:
        return jsonify({"success": False, "message": f"Lỗi: {str(e)}"})


@app.route("/upload-status", methods=["GET"])
def get_upload_status():
    """
    API: Lấy danh sách video local và trạng thái upload
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


@app.route("/storage")
def storage_page():
    if "user" not in session:
        return redirect(url_for("login"))

    # Kiểm tra S3 đã cấu hình chưa
    if not s3_service.is_configured():
        flash("⚠️ Chưa cấu hình tài khoản S3. Vui lòng cài đặt trước.", "error")
        return redirect(url_for("storage_settings"))
    
    # Quét video local và tự động đưa vào queue nếu chưa có
    _auto_queue_local_videos()
    
    # Lấy video và thông tin storage từ S3
    try:
        s3_videos = s3_service.list_videos(limit=1000)
        total_size = s3_service.get_total_size()
        
        # Convert S3VideoInfo sang VideoInfo format
        from services.storage_service import VideoInfo
        videos_info = []
        for v in s3_videos:
            videos_info.append(VideoInfo(
                name=v.key,
                path="",  # Không cần path cho S3
                size_bytes=v.size_bytes,
                created_at=v.last_modified,
                status="An toàn",
            ))
        
        # Không giới hạn dung lượng cho S3 (hoặc lấy từ bucket quota)
        max_bytes = 100 * 1024 * 1024 * 1024  # 100GB default (có thể tùy chỉnh)
        status = storage_service.get_storage_status(total_size, max_bytes)
        
    except Exception as e:
        print(f"[S3 ERROR] Error getting storage info: {e}")
        flash(f"❌ Lỗi kết nối S3: {str(e)}", "error")
        videos_info = []
        total_size = 0
        max_bytes = 100 * 1024 * 1024 * 1024
        status = "Lỗi kết nối"
    
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
        storage_mode="s3",
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
    
    # Xóa từ S3
    if not s3_service.is_configured():
        flash("❌ Chưa cấu hình S3", "error")
        return redirect(url_for("storage_page"))
    
    try:
        success, message = s3_service.delete_video(filename)
        if success:
            flash(f"✅ Đã xóa video: {filename}")
        else:
            flash(f"❌ {message}", "error")
    except Exception as e:
        flash(f"❌ Lỗi khi xóa video: {str(e)}", "error")
    
    return redirect(url_for("storage_page"))


@app.route("/test_camera", methods=["POST"])
def test_camera():
    """
    Test xem camera có khả dụng không (KHÔNG khởi động camera).
    """
    import cv2
    
    try:
        # Load config
        saved_configs, _, _, _, _, _ = load_config()
        if not saved_configs:
            saved_configs = [_default_camera_config()]
        
        first_cam_config = saved_configs[0]
        source_type = first_cam_config.get("source_type", SOURCE_USB)
        
        # Test camera
        if source_type == SOURCE_RTSP:
            rtsp_url = first_cam_config.get("rtsp_url", "")
            if not rtsp_url:
                raise ValueError("RTSP URL is empty")
            cap = cv2.VideoCapture(rtsp_url)
        else:
            camera_index = first_cam_config.get("camera_index", 0)
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
            "message": f"Camera OK ({source_type})",
            "source_type": source_type,
            "config": first_cam_config
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
    try:
        # Load config
        saved_configs, saved_sensitivity, saved_interval, saved_auto_record, _, saved_s3_config = load_config()
        
        if not saved_configs:
            saved_configs = [_default_camera_config()]
        
        # Build and start cameras
        print("[START CAMERAS] Building camera managers...")
        build_managers_and_scanners(saved_configs, scan_interval_sec=saved_interval, sensitivity=saved_sensitivity)
        
        camera_configs.clear()
        camera_configs.extend(saved_configs)
        
        # Load settings
        with state_lock:
            app_state["auto_record_on_qr"] = saved_auto_record
        
        # Load S3 config
        if saved_s3_config:
            s3_service.config = saved_s3_config
            print(f"[S3] Loaded S3 config: {saved_s3_config.bucket}")
        
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

    now = time.time()
    recording_seconds = int(now - start) if is_recording and start else 0

    return jsonify(
        {
            "is_recording": is_recording,
            "recording_seconds": recording_seconds,
            "current_order_code": current_order_code,
            "order_info": order_info,
            "num_cameras": len(camera_managers),
        }
    )


def _trigger_auto_recording(code: str):
    """
    Helper function để tự động bắt đầu quay video (gọi từ on_code_detected).
    """
    try:
        with state_lock:
            if app_state["is_recording"]:
                return
            app_state["recording_order_code"] = code

        video_path = storage_service.start_new_recording(VIDEOS_DIR, code)

        primary = _primary_camera_manager
        w = (primary.width if primary else 1280) or 1280
        h = (primary.height if primary else 720) or 720
        if w < 320:
            w = 1280
        if h < 240:
            h = 720
        frame_size = (int(w), int(h))

        # PAUSE AI scanner
        print("[AUTO-RECORD] Tam dung AI scanner...")
        for scanner in ai_scanners:
            if scanner:
                scanner.pause()
        time.sleep(0.2)

        # Bắt đầu quay
        recorder.start(video_path, frame_size=frame_size, fps=15.0)

        if recorder.file_path and recorder.file_path != video_path:
            storage_service.update_recording_path(code, recorder.file_path)

        with state_lock:
            app_state["is_recording"] = True
            app_state["recording_start"] = time.time()

        print(f"[AUTO-RECORD] Da bat dau quay tu dong cho QR: {code}")
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
        with state_lock:
            if app_state["is_recording"]:
                return jsonify({"ok": True, "message": "Đang quay"}), 200
            code = app_state["current_order_code"]
            if code is None:
                code = "recording_" + str(int(time.time()))
            app_state["recording_order_code"] = code

        video_path = storage_service.start_new_recording(VIDEOS_DIR, code)

        primary = _primary_camera_manager
        w = (primary.width if primary else 1280) or 1280
        h = (primary.height if primary else 720) or 720
        if w < 320:
            w = 1280
        if h < 240:
            h = 720
        frame_size = (int(w), int(h))
        
        print(f"[DEBUG app.py] primary camera: width={primary.width if primary else 'None'}, height={primary.height if primary else 'None'}")
        print(f"[DEBUG app.py] frame_size truyen vao recorder: {frame_size}")
        print(f"[DEBUG app.py] recorder.is_recording truoc khi start: {recorder.is_recording}")

        # Tat AI scanner khi dang record de tranh conflict va tang performance
        print("[INFO] PAUSE AI QR scanner when starting record...")
        for scanner in ai_scanners:
            if scanner:
                scanner.pause()
        
        # Chờ 200ms để scanner giải phóng frame
        time.sleep(0.2)
        
        # Bắt đầu quay video (FPS 15 để tránh timestamp conflict với RTSP)
        print(f"[INFO] Starting ASYNC recorder (FPS=15, size={frame_size})")
        print(f"[INFO] Recorder has SEPARATE THREAD with 90-frame buffer")
        recorder.start(video_path, frame_size=frame_size, fps=15.0)
        
        # Cập nhật path thực tế nếu recorder đổi extension (mp4 -> avi)
        if recorder.file_path and recorder.file_path != video_path:
            storage_service.update_recording_path(code, recorder.file_path)

        with state_lock:
            app_state["is_recording"] = True
            app_state["recording_start"] = time.time()

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


@app.route("/stop_recording", methods=["POST"])
def stop_recording():
    """
    Dừng quay và upload lên S3 (nếu cấu hình).
    """
    if "user" not in session:
        return jsonify({"error": "Chưa đăng nhập"}), 401

    with state_lock:
        if not app_state["is_recording"]:
            return jsonify({"ok": True, "message": "Không ở trạng thái quay"}), 200
        start = app_state["recording_start"]
        code = app_state.get("recording_order_code") or app_state["current_order_code"]

    duration = recorder.stop()
    video_path = recorder.file_path  # Lưu path trước khi reset
    order_code = code or "unknown"

    if code:
        storage_service.finish_recording_for_order(code, duration_seconds=duration)

    # Reset mã đơn sau khi in xong (quay xong)
    with state_lock:
        app_state["is_recording"] = False
        app_state["recording_start"] = None
        app_state["recording_order_code"] = None
        app_state["current_order_code"] = None
        app_state["current_order_info"] = None

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
            status="pending"
        )
        
        with upload_status_lock:
            upload_status_dict[filename] = task
        
        upload_queue.put(task)
        print(f"[UPLOAD QUEUE] Added to queue: {filename} (queue size: {upload_queue.qsize()})")
    else:
        print(f"[WARNING] No video file to upload")

    return jsonify({"ok": True, "duration": duration, "message": "In xong"})


@app.route("/reset_order", methods=["POST"])
def reset_order():
    """
    Cho phép reset mã đơn trong phiên hiện tại.
    """
    if "user" not in session:
        return jsonify({"error": "Chưa đăng nhập"}), 401

    with state_lock:
        app_state["current_order_code"] = None
        app_state["current_order_info"] = None
    for sc in ai_scanners:
        sc.reset()
    return jsonify({"ok": True})


@app.route("/videos/<path:filename>")
def serve_video(filename):
    """
    Cho phép tải video từ S3.
    """
    if not s3_service.is_configured():
        return jsonify({"error": "Chưa cấu hình S3"}), 500
    
    # Generate presigned URL để download từ S3
    url = s3_service.generate_presigned_url(filename, expiration=3600)
    if url:
        return redirect(url)
    else:
        return jsonify({"error": "Không thể tạo link download"}), 500


if __name__ == "__main__":
    # QUEUE LOCAL VIDEOS: Đưa tất cả video local vào upload queue
    print("[STARTUP] Scanning for local videos to upload...")
    try:
        video_dir = os.path.join(BASE_DIR, "videos")
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
                    print(f"[STARTUP] Queued for upload: {filename}")
            
            if queued_count > 0:
                print(f"[STARTUP] Queued {queued_count} local video(s) for upload to S3")
            else:
                print("[STARTUP] No local videos found. All videos are on S3.")
    except Exception as e:
        print(f"[STARTUP] Error scanning local videos: {e}")
    
    # Load cấu hình từ file (KHÔNG TỰ ĐỘNG KHỞI ĐỘNG CAMERA)
    saved_configs, saved_sensitivity, saved_interval, saved_auto_record, saved_storage_mode, saved_s3_config = load_config()
    
    # Load S3 config (nếu có)
    if saved_s3_config:
        s3_service.config = saved_s3_config
        print(f"[S3] Loaded S3 config: {saved_s3_config.bucket}")
    else:
        print("[WARNING] S3 not configured. Please configure S3 account.")
    
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
    
    print("\n" + "="*60)
    print("  ECOHUB QR SCANNER - READY")
    print("="*60)
    print(f"  URL: http://127.0.0.1:5000")
    print(f"  Camera Status: NOT STARTED (manual start required)")
    print(f"  S3 Status: {'CONFIGURED' if saved_s3_config else 'NOT CONFIGURED'}")
    print("="*60 + "\n")
    
    app.run(host="127.0.0.1", port=5000, debug=True, threaded=True)

