import os
import threading
import time
import json
from datetime import datetime

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

BASE_DIR = os.path.dirname(__file__)
VIDEOS_DIR = os.path.join(BASE_DIR, "videos")
CONFIG_FILE = os.path.join(BASE_DIR, "config.json")
os.makedirs(VIDEOS_DIR, exist_ok=True)

MAX_RESUME_MINUTES = 10
MAX_CAMERAS = 4  # tối đa số camera quét cùng lúc

app = Flask(__name__)
app.secret_key = "ecohub-demo-secret"


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
    created_at: datetime = field(default_factory=datetime.now)
    
upload_queue = Queue()  # Queue FIFO để upload tuần tự
upload_status_lock = threading.Lock()
upload_status_dict = {}  # {filename: UploadTask} - theo dõi trạng thái


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
    while True:
        task = None
        try:
            # Lấy task từ queue (blocking với timeout)
            try:
                task = upload_queue.get(timeout=1)
            except:
                # Queue empty, continue loop
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
                        
                        # Xóa khỏi status dict sau 10s (đã thành công)
                        time.sleep(10)
                        with upload_status_lock:
                            upload_status_dict.pop(task.filename, None)
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

# Encryption cho sensitive data
encryptor = get_encryptor(os.path.join(BASE_DIR, "config.key"))


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


# Khởi tạo 1 camera mặc định
build_managers_and_scanners(camera_configs)
_ensure_primary_references()


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
    return render_template("dashboard.html", num_cameras=len(camera_managers))


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
        
        # Quét tất cả video trong thư mục local
        if os.path.exists(VIDEOS_DIR):
            for filename in os.listdir(VIDEOS_DIR):
                if filename.endswith(('.mp4', '.avi')):
                    file_path = os.path.join(VIDEOS_DIR, filename)
                    file_size = os.path.getsize(file_path)
                    file_time = datetime.fromtimestamp(os.path.getctime(file_path))
                    
                    # Lấy trạng thái từ upload_status_dict
                    with upload_status_lock:
                        task = upload_status_dict.get(filename)
                    
                    if task:
                        status = task.status
                        error_msg = task.error_msg
                    else:
                        # Video này chưa được đưa vào queue (có thể là file cũ)
                        status = "not_queued"
                        error_msg = "Chưa được đưa vào hàng đợi upload"
                    
                    local_videos.append({
                        "filename": filename,
                        "size_mb": round(file_size / (1024 * 1024), 2),
                        "created_at": file_time.strftime("%d/%m/%Y %H:%M:%S"),
                        "status": status,
                        "error_msg": error_msg,
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

        # PAUSE AI scanner để VideoWriter init không bị conflict
        print("[INFO] PAUSE AI scanner de khoi tao VideoWriter...")
        for scanner in ai_scanners:
            if scanner:
                scanner.pause()
        
        # Chờ 200ms để scanner giải phóng frame
        time.sleep(0.2)
        
        # Bắt đầu quay video (FPS 15 để tránh timestamp conflict với RTSP)
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

    # Reset tất cả scanner để quét mã mới và RESUME scanner
    print("[INFO] RESUME AI scanner sau khi dung quay...")
    for sc in ai_scanners:
        sc.reset()
        sc.resume()  # Resume (tiếp tục quét)

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
    
    # Load cấu hình từ file (nếu có) và khởi tạo camera
    saved_configs, saved_sensitivity, saved_interval, saved_auto_record, saved_storage_mode, saved_s3_config = load_config()
    try:
        build_managers_and_scanners(saved_configs, scan_interval_sec=saved_interval, sensitivity=saved_sensitivity)
        camera_configs.clear()
        camera_configs.extend(saved_configs)
        
        # Load auto_record setting vào app_state
        with state_lock:
            app_state["auto_record_on_qr"] = saved_auto_record
        
        # Load S3 config to s3_service
        if saved_s3_config:
            s3_service.config = saved_s3_config
            print(f"[S3] Loaded S3 config: {saved_s3_config.bucket}")
        else:
            print("[WARNING] S3 not configured. Please configure S3 account.")
        
        print("Loaded config from config.json (%d camera)." % len(saved_configs))
    except Exception as e:
        print("Loi khoi dong camera tu config: %s" % str(e))
    
    # Khởi động upload worker thread
    upload_thread = threading.Thread(target=upload_worker, daemon=True, name="UploadWorker")
    upload_thread.start()
    print("[UPLOAD WORKER] Upload worker thread started")
    
    for i, mgr in enumerate(camera_managers):
        try:
            if not mgr.is_running:
                mgr.start()
        except RuntimeError:
            print("Loi khoi dong camera %d." % i)
    for sc in ai_scanners:
        if not sc._running:
            sc.start()
    app.run(host="127.0.0.1", port=5000, debug=True, threaded=True)

