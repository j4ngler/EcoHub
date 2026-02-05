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
    Trả về: (camera_configs, scan_sensitivity, scan_interval_sec, auto_record_on_qr)
    """
    if not os.path.exists(CONFIG_FILE):
        return ([_default_camera_config()], SENSITIVITY_NORMAL, 0.05, False)
    try:
        with open(CONFIG_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        configs = data.get("camera_configs", [_default_camera_config()])
        sensitivity = data.get("scan_sensitivity", SENSITIVITY_NORMAL)
        auto_record = data.get("auto_record_on_qr", False)
        interval_map = {SENSITIVITY_LOW: 0.1, SENSITIVITY_NORMAL: 0.05, SENSITIVITY_HIGH: 0.03}
        interval = interval_map.get(sensitivity, 0.05)
        return (configs, sensitivity, interval, auto_record)
    except Exception as e:
        print("Loi doc config.json: %s" % str(e))
        return ([_default_camera_config()], SENSITIVITY_NORMAL, 0.05, False)


def save_config(configs, scan_sensitivity, auto_record_on_qr=False):
    """
    Ghi cấu hình vào file config.json.
    """
    try:
        data = {
            "camera_configs": configs,
            "scan_sensitivity": scan_sensitivity,
            "auto_record_on_qr": auto_record_on_qr,
        }
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


@app.route("/storage")
def storage_page():
    if "user" not in session:
        return redirect(url_for("login"))

    videos_info, total_size = storage_service.get_videos_info(VIDEOS_DIR)
    max_bytes = storage_service.MAX_TOTAL_BYTES
    status = storage_service.get_storage_status(total_size, max_bytes)

    return render_template(
        "storage.html",
        videos=videos_info,
        total_size=total_size,
        max_size=max_bytes,
        status=status,
    )


@app.route("/storage/delete/<path:filename>", methods=["POST"])
def delete_video(filename):
    if "user" not in session:
        return redirect(url_for("login"))
    storage_service.delete_video(VIDEOS_DIR, filename)
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
    Dừng quay. Popup xác nhận được xử lý trên frontend (JS confirm).
    """
    if "user" not in session:
        return jsonify({"error": "Chưa đăng nhập"}), 401

    with state_lock:
        if not app_state["is_recording"]:
            return jsonify({"ok": True, "message": "Không ở trạng thái quay"}), 200
        start = app_state["recording_start"]
        code = app_state.get("recording_order_code") or app_state["current_order_code"]

    duration = recorder.stop()

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
    Cho phép tải video về để kiểm tra.
    """
    from flask import send_from_directory

    return send_from_directory(VIDEOS_DIR, filename, as_attachment=True)


if __name__ == "__main__":
    # Load cấu hình từ file (nếu có) và khởi tạo camera
    saved_configs, saved_sensitivity, saved_interval, saved_auto_record = load_config()
    try:
        build_managers_and_scanners(saved_configs, scan_interval_sec=saved_interval, sensitivity=saved_sensitivity)
        camera_configs.clear()
        camera_configs.extend(saved_configs)
        
        # Load auto_record setting vào app_state
        with state_lock:
            app_state["auto_record_on_qr"] = saved_auto_record
        
        print("Da load cai dat tu config.json (%d camera)." % len(saved_configs))
    except Exception as e:
        print("Loi khoi dong camera tu config: %s" % str(e))
    
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

