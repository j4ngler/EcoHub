# 📘 TÀI LIỆU HỆ THỐNG ECOHUB QR SCANNER

## 📋 MỤC LỤC

1. [Tổng quan hệ thống](#1-tổng-quan-hệ-thống)
2. [Kiến trúc hệ thống](#2-kiến-trúc-hệ-thống)
3. [Cài đặt môi trường phát triển](#3-cài-đặt-môi-trường-phát-triển)
4. [Chạy ứng dụng Development](#4-chạy-ứng-dụng-development)
5. [Build thành file EXE](#5-build-thành-file-exe)
6. [Tạo Installer](#6-tạo-installer)
7. [Hướng dẫn sử dụng](#7-hướng-dẫn-sử-dụng)
8. [Cấu hình nâng cao](#8-cấu-hình-nâng-cao)
9. [Xử lý sự cố](#9-xử-lý-sự-cố)

---

## 1. TỔNG QUAN HỆ THỐNG

### 🎯 Mục đích
**EcoHub QR Scanner** là ứng dụng quét mã QR/Barcode, tự động quay video đóng gói đơn hàng và upload lên S3 storage.

### ✨ Tính năng chính

#### **1. Quét mã QR/Barcode**
- Hỗ trợ camera USB và RTSP
- Tối đa 2 camera đồng thời
- AI tự động detect mã với ZXing-CPP
- FPS tối ưu: 5 FPS cho AI, 15 FPS cho video
- Cooldown 5 phút để tránh quét lại

#### **2. Quay video tự động**
- Tự động bắt đầu khi quét được QR
- Asynchronous recording (thread riêng)
- Buffer 90 frames để không bị lag
- Pause AI scanner khi đang quay
- Timestamp GMT+7

#### **3. Upload lên S3**
- Hỗ trợ S3-compatible storage (AWS S3, CMC Cloud, MinIO...)
- Upload queue với multipart upload
- Retry mechanism cho failed uploads
- Presigned URL để download
- Encrypted credentials

#### **4. Quản lý camera**
- Safe startup: Không tự động bật camera
- Test camera trước khi start
- Start/Stop manual từ Settings page
- Cấu hình USB/RTSP linh hoạt

#### **5. Upload History**
- Hiển thị tất cả videos (pending/uploading/success)
- Cleanup tự động vào 00:00 hàng ngày
- Status realtime với locking

---

## 2. KIẾN TRÚC HỆ THỐNG

### 🏗️ Tech Stack

```
Frontend:
├── HTML5/CSS3/JavaScript
├── Bootstrap 5
└── MJPEG Streaming

Backend:
├── Flask 2.3.0
├── Python 3.11
├── OpenCV (opencv-python)
├── ZXing-CPP 2.2.0
├── Boto3 (S3 SDK)
└── Cryptography (Fernet encryption)
```

### 📁 Cấu trúc thư mục

```
eco_hub_demo/
├── app.py                      # Main Flask application
├── config.json                 # Cấu hình camera + S3
├── config.key                  # Encryption key
├── requirements.txt            # Python dependencies
│
├── camera/                     # Camera & AI modules
│   ├── camera_manager.py       # Camera stream management
│   ├── camera_stream.py        # MJPEG streaming
│   ├── ai_scanner.py           # AI QR/Barcode scanner
│   └── recorder.py             # Async video recorder
│
├── services/                   # Business logic
│   ├── s3_service.py           # S3 upload/download
│   ├── storage_service.py      # Local storage management
│   ├── order_service.py        # Order info (mock)
│   └── config_encryption.py    # Credential encryption
│
├── templates/                  # HTML templates
│   ├── base.html
│   ├── dashboard.html
│   ├── camera_settings.html
│   ├── storage_settings.html
│   └── storage.html
│
├── static/                     # CSS/JS files
│   ├── css/style.css
│   └── js/main.js
│
├── videos/                     # Local video storage
│
├── build.spec                  # PyInstaller config
├── build_exe.bat               # Build EXE script
├── build_installer.bat         # Build installer script
└── setup.iss                   # Inno Setup config
```

### 🔄 Luồng hoạt động

```
[Camera USB/RTSP]
        ↓
[Camera Manager Thread]  ← Đọc frames liên tục (10ms interval)
        ↓
    [Queue] ← Frame buffer (maxsize=2)
        ↓
[AI Scanner Thread]  ← Process frames (5 FPS, timestamp-based)
        ↓
    [ZXing Decode]
        ↓
[QR Code Detected] → [Cooldown Check] → [Trigger Recording]
        ↓                                         ↓
[5-minute cooldown]                      [Async Recorder Thread]
                                                 ↓
                                         [Video Writer (90-frame buffer)]
                                                 ↓
                                         [Save to videos/]
                                                 ↓
                                         [Upload Queue] → [S3 Upload Worker]
                                                                 ↓
                                                         [S3 Storage]
```

### 🧵 Threading Model

```
Main Thread (Flask):
├── HTTP Server (port 5000)
└── Route handlers

Camera Thread 1-2:
├── Read frames from camera
├── Push to frame queue
└── Push to recorder queue (if recording)

AI Scanner Thread 1-2:
├── Get frames from queue
├── Decode QR/Barcode
└── Trigger callbacks

Recorder Thread:
├── Get frames from queue
└── Write to VideoWriter

Upload Worker Thread:
├── Process upload queue
├── Multipart upload to S3
└── Update status dict
```

---

## 3. CÀI ĐẶT MÔI TRƯỜNG PHÁT TRIỂN

### 📌 Yêu cầu hệ thống

- **OS**: Windows 10/11
- **Python**: 3.11.x
- **RAM**: Tối thiểu 4GB
- **Camera**: USB hoặc RTSP stream
- **S3 Account**: Access Key + Secret Key + Bucket

### 🔧 Cài đặt Python

1. **Download Python 3.11**:
   ```
   https://www.python.org/downloads/
   ```

2. **Cài đặt** (check "Add Python to PATH"):
   ```bash
   # Verify installation
   python --version  # Python 3.11.x
   pip --version
   ```

### 📦 Cài đặt dependencies

```bash
cd eco_hub_demo
pip install -r requirements.txt
```

**Requirements:**
```
flask>=2.3.0
opencv-python
zxing-cpp>=2.2.0
numpy
boto3>=1.28.0
cryptography>=41.0.0
```

### 🎥 Cài đặt camera

#### **USB Camera:**
- Cắm camera USB vào máy
- Windows sẽ tự động nhận diện

#### **RTSP Camera:**
- Kiểm tra IP camera: `rtsp://<ip>:<port>/stream`
- Test với VLC: Media → Open Network Stream

---

## 4. CHẠY ỨNG DỤNG DEVELOPMENT

### 🚀 Khởi động server

```bash
cd eco_hub_demo
python app.py
```

**Console output:**
```
[STARTUP] Scanning for local videos to upload...
[S3] Loaded S3 config: <bucket-name>
[STARTUP] Config loaded. Camera: 1 (NOT STARTED YET)
[STARTUP] User will test and start cameras manually from dashboard

============================================================
  ECOHUB QR SCANNER - READY
============================================================
  URL: http://127.0.0.1:5000
  Camera Status: NOT STARTED (manual start required)
  S3 Status: CONFIGURED / NOT CONFIGURED
============================================================

 * Running on http://127.0.0.1:5000
```

### 🌐 Truy cập ứng dụng

```
http://127.0.0.1:5000
```

### 🔐 Login (Mock)

- Username: bất kỳ
- Không cần password

---

## 5. BUILD THÀNH FILE EXE

### 📋 Yêu cầu

```bash
pip install pyinstaller>=6.0.0
```

### 🔨 Build với script tự động

```bash
build_exe.bat
```

**Script sẽ:**
1. Check PyInstaller
2. Install dependencies
3. Clean old build
4. Build EXE với PyInstaller

**Output:**
```
dist/EcoHub_QR_Scanner/
├── EcoHub_QR_Scanner.exe       (19 MB)
└── _internal/                  (200+ MB)
    ├── static/
    ├── templates/
    ├── config.json
    ├── config.key
    └── ... (Python runtime + libraries)
```

### 🔧 Build manual

```bash
# Clean
rmdir /s /q dist build

# Build
pyinstaller build.spec --clean
```

### ⚙️ Cấu hình build (`build.spec`)

```python
# Thêm/bớt files vào build
datas=[
    ('templates', 'templates'),
    ('static', 'static'),
    ('config.json', '.'),
    ('config.key', '.'),
    ('README.md', '.'),
],

# Thêm hidden imports nếu thiếu modules
hiddenimports=[
    'flask',
    'cv2',
    'numpy',
    'boto3',
    'botocore',
    'cryptography',
    'zxingcpp',
],

# Console mode (hiện console để debug)
console=True,  # False để ẩn console
```

### 🧪 Test EXE

```bash
cd dist\EcoHub_QR_Scanner
EcoHub_QR_Scanner.exe
```

**Check:**
- ✅ App mở được
- ✅ Console hiện logs
- ✅ Browser tự động mở http://127.0.0.1:5000
- ✅ Templates/Static load được
- ✅ Config files copy vào `C:\Users\<user>\EcoHub_QR_Scanner\`

---

## 6. TẠO INSTALLER

### 📋 Yêu cầu

**Download Inno Setup:**
```
https://jrsoftware.org/isdl.php
```

**Cài vào:**
```
C:\Program Files (x86)\Inno Setup 6\
```

### 🔨 Build installer

```bash
build_installer.bat
```

**Script sẽ:**
1. Check Inno Setup installation
2. Check EXE exists
3. Build installer với Inno Setup

**Output:**
```
installer_output/
└── EcoHub_QR_Scanner_Setup_v1.0.0.exe  (88 MB)
```

### 🔧 Build manual

```bash
"C:\Program Files (x86)\Inno Setup 6\ISCC.exe" setup.iss
```

### ⚙️ Cấu hình installer (`setup.iss`)

```iss
; Version
#define MyAppVersion "1.0.0"

; Cài vào
DefaultDirName={autopf}\{#MyAppName}

; Output
OutputDir=installer_output
OutputBaseFilename=EcoHub_QR_Scanner_Setup_v{#MyAppVersion}

; Files
Source: "dist\EcoHub_QR_Scanner\*";
Source: "config.json"; Flags: onlyifdoesntexist
```

### 📦 Installer features

- ✅ Cài đặt tự động
- ✅ Desktop shortcut
- ✅ Start Menu shortcut
- ✅ Uninstaller
- ✅ Tự động tạo `videos` folder
- ✅ Giữ `config.json` khi update

---

## 7. HƯỚNG DẪN SỬ DỤNG

### 🚀 Lần đầu sử dụng

#### **Bước 1: Cài đặt**
1. Double-click `EcoHub_QR_Scanner_Setup_v1.0.0.exe`
2. Next → Next → Install
3. Finish

#### **Bước 2: Khởi động**
- Desktop: Double-click icon "EcoHub QR Scanner"
- Start Menu: Tìm "EcoHub QR Scanner"

#### **Bước 3: Login**
- Username: admin (hoặc bất kỳ)
- Click "Đăng nhập"

#### **Bước 4: Cài đặt Camera**

1. **Vào menu: ⚙️ Cài đặt camera**

2. **Test camera:**
   - Click **"Test Camera"**
   - ✅ OK: "Camera OK (usb)"
   - ❌ Lỗi: Kiểm tra camera

3. **Start camera:**
   - Click **"Start Camera"**
   - Confirm
   - Page reload → Camera feed hiển thị

4. **Cấu hình camera (tùy chọn):**
   - Camera 1: USB hoặc RTSP
   - Camera 2: Bật/Tắt
   - Độ nhạy AI: Thấp/Trung bình/Cao
   - Tự động quay khi quét QR: ☑ / ☐
   - Click **"Áp dụng"**

#### **Bước 5: Cài đặt S3**

1. **Vào menu: ☁️ Cài đặt S3**

2. **Nhập thông tin:**
   ```
   Endpoint: https://s3.amazonaws.com (hoặc CMC Cloud...)
   Region: ap-southeast-1
   Bucket: your-bucket-name
   Access Key: AKIA...
   Secret Key: ******
   ```

3. **Click "Test kết nối"**
   - ✅ OK: "Kết nối S3 thành công"
   - ❌ Lỗi: Kiểm tra credentials

4. **Click "Lưu cấu hình"**

### 📹 Sử dụng hàng ngày

#### **Dashboard:**

1. **Camera live feed**
   - Hiển thị camera realtime
   - AI tự động detect QR/Barcode
   - Badge status: Đang chạy / Chưa khởi động

2. **Mã đơn hiện tại**
   - Hiển thị mã vừa quét
   - Button "Reset mã" để quét lại

3. **Thông tin đơn hàng**
   - Order ID
   - Platform
   - Items list

4. **Quay video**
   - Trạng thái: Idle / Recording
   - Thời gian: 00:00
   - **Bắt đầu quay** (manual)
   - **Kết thúc** (stop recording)

#### **Kho lưu trữ:**

1. **Tab "Video trên S3"**
   - Danh sách videos đã upload
   - Filename, Size, Last Modified
   - Actions: Download, Delete

2. **Tab "Lịch sử upload"**
   - Pending: Chưa upload
   - Uploading: Đang upload (progress %)
   - Success: Upload thành công
   - Failed: Upload lỗi
   - Tự động xóa vào 00:00 hàng ngày

### 🔄 Workflow tự động

```
1. Nhân viên đóng gói đơn hàng
         ↓
2. Quét QR code đơn hàng bằng camera
         ↓
3. App detect QR → Tự động bắt đầu quay video
         ↓
4. Nhân viên đóng gói (15-30s)
         ↓
5. Nhân viên click "Kết thúc" hoặc tự động stop
         ↓
6. Video lưu vào local + tự động upload S3
         ↓
7. Upload thành công → Xóa file local
         ↓
8. Cooldown 5 phút → Sẵn sàng quét mã tiếp theo
```

---

## 8. CẤU HÌNH NÂNG CAO

### 📝 File `config.json`

```json
{
  "cameras": [
    {
      "source_type": "usb",
      "camera_index": 0,
      "width": 1280,
      "height": 720,
      "fps": 30,
      "rtsp_url": ""
    }
  ],
  "scan_sensitivity": "normal",
  "scan_interval_sec": 0.05,
  "auto_record_on_qr": true,
  "storage_mode": "s3",
  "s3_config": {
    "endpoint": "https://...",
    "region": "ap-southeast-1",
    "bucket": "bucket-name",
    "access_key_encrypted": "...",
    "secret_key_encrypted": "..."
  }
}
```

### 🔐 Encryption

**File `config.key`:**
- Fernet symmetric encryption
- 44 bytes, base64-encoded
- Tự động tạo khi first run
- Lưu ở `C:\Users\<user>\EcoHub_QR_Scanner\config.key`

**Encrypted fields:**
- S3 Access Key
- S3 Secret Key

### 🎥 Camera parameters

**USB Camera:**
```json
{
  "source_type": "usb",
  "camera_index": 0  // 0, 1, 2...
}
```

**RTSP Camera:**
```json
{
  "source_type": "rtsp",
  "rtsp_url": "rtsp://admin:password@192.168.1.100:554/stream"
}
```

**Resolution & FPS:**
```json
{
  "width": 1280,    // 640, 1280, 1920
  "height": 720,    // 480, 720, 1080
  "fps": 30         // 15, 20, 25, 30
}
```

### 🤖 AI Scanner parameters

**Sensitivity:**
- `"low"`: 0.1s interval (10 FPS)
- `"normal"`: 0.05s interval (20 FPS)
- `"high"`: 0.03s interval (33 FPS)

**Cooldown:**
- Default: 300s (5 phút)
- Sửa trong `camera/ai_scanner.py`:
  ```python
  COOLDOWN_SECONDS = 5 * 60  # 5 minutes
  ```

### 📹 Recording parameters

**FPS:**
```python
# camera/recorder.py
recorder.start(video_path, frame_size=(1280, 720), fps=15.0)
```

**Buffer size:**
```python
# camera/recorder.py
_frame_queue = queue.Queue(maxsize=90)  # 90 frames = 6s @ 15 FPS
```

### ☁️ S3 parameters

**Multipart upload:**
```python
# services/s3_service.py
MULTIPART_THRESHOLD = 50 * 1024 * 1024  # 50 MB
MULTIPART_CHUNKSIZE = 10 * 1024 * 1024  # 10 MB chunks
```

**Presigned URL expiration:**
```python
# app.py
url = s3_service.generate_presigned_url(filename, expiration=3600)  # 1 hour
```

---

## 9. XỬ LÝ SỰ CỐ

### ❌ Lỗi thường gặp

#### **1. Camera không khởi động**

**Triệu chứng:**
```
[ERROR] Cannot open camera: index 0
```

**Nguyên nhân:**
- Camera chưa cắm
- Driver chưa cài
- Camera đang được dùng bởi app khác

**Giải pháp:**
```bash
# Check camera
1. Cắm lại camera USB
2. Device Manager → Cameras → Check driver
3. Đóng Skype, Teams, Zoom...
4. Restart app
```

#### **2. RTSP timeout**

**Triệu chứng:**
```
[ERROR] RTSP connection timeout
```

**Nguyên nhân:**
- IP camera không khả dụng
- URL sai
- Firewall block

**Giải pháp:**
```bash
# Test với VLC
1. VLC → Media → Open Network Stream
2. Nhập RTSP URL
3. Nếu VLC OK → Check firewall
4. Nếu VLC lỗi → Check IP, username, password
```

#### **3. S3 upload failed**

**Triệu chứng:**
```
[UPLOAD WORKER] Failed: Access Denied
```

**Nguyên nhân:**
- Credentials sai
- Bucket không tồn tại
- Permission không đủ

**Giải pháp:**
```bash
1. Vào "Cài đặt S3"
2. Click "Test kết nối"
3. Check logs để xem lỗi chi tiết
4. Verify:
   - Access Key đúng
   - Secret Key đúng
   - Bucket name đúng
   - IAM permissions: s3:PutObject, s3:GetObject, s3:DeleteObject
```

#### **4. Templates not found (PyInstaller)**

**Triệu chứng:**
```
TemplateNotFound: dashboard.html
```

**Nguyên nhân:**
- Build thiếu templates folder

**Giải pháp:**
```python
# Check build.spec
datas=[
    ('templates', 'templates'),  # ← Phải có dòng này
    ('static', 'static'),
]

# Rebuild
pyinstaller build.spec --clean
```

#### **5. UnicodeEncodeError (Windows console)**

**Triệu chứng:**
```
UnicodeEncodeError: 'charmap' codec can't encode character '\u1eae'
```

**Nguyên nhân:**
- Windows console không hỗ trợ UTF-8

**Giải pháp:**
```python
# app.py (đã có)
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
```

#### **6. Video lag 5 giây**

**Triệu chứng:**
- Video chậm hơn real-time 5 giây

**Nguyên nhân:**
- RTSP buffer
- Frame queue full

**Giải pháp:**
```python
# camera/camera_manager.py (đã fix)
cap.set(cv2.CAP_PROP_BUFFERSIZE, 0)  # No buffer for RTSP
```

#### **7. Memory leak (app chậm dần)**

**Triệu chứng:**
- App càng chạy càng chậm
- RAM tăng liên tục

**Nguyên nhân:**
- `_code_history` dict không giới hạn

**Giải pháp:**
```python
# camera/ai_scanner.py (đã fix)
# Cleanup old history mỗi 60s
if current_time - last_cleanup_time > CLEANUP_INTERVAL:
    old_keys = [k for k, v in _code_history.items() 
                if current_time - v > COOLDOWN_SECONDS]
    for k in old_keys:
        del _code_history[k]
```

### 🐛 Debug tips

#### **1. Check logs:**
```bash
# Development
python app.py  # Console output

# Production (EXE)
EcoHub_QR_Scanner.exe  # Console hiển thị logs
```

#### **2. Enable debug timing:**
```python
# camera/ai_scanner.py
[AI DEBUG] fps=5.2, queue=1/2, drop=0, t_total=0.189s, ...
```

#### **3. Check camera status:**
```
Dashboard → Camera status badge
Settings → Camera Control Panel
```

#### **4. Check upload status:**
```
Kho lưu trữ → Tab "Lịch sử upload"
```

#### **5. Check S3 connection:**
```
Cài đặt S3 → Test kết nối
```

### 📞 Support

**Issues:**
- Check console logs
- Check `warn-build.txt` (nếu build lỗi)
- Check camera permissions
- Check S3 credentials

**Performance:**
- Camera FPS: 15-30 FPS
- AI FPS: 5 FPS
- Recording FPS: 15 FPS
- Upload speed: Phụ thuộc bandwidth

---

## 📚 PHỤ LỤC

### A. Keyboard Shortcuts

Không có (sử dụng GUI)

### B. API Endpoints

```
GET  /                      Login page
POST /                      Login submit
GET  /dashboard             Dashboard
GET  /camera-settings       Camera settings page
POST /camera-settings       Save camera settings
GET  /storage-settings      S3 settings page
POST /storage-settings      Save S3 settings
GET  /storage               Storage page (videos)
GET  /upload-status         Upload status API
POST /test_camera           Test camera
POST /start_cameras         Start cameras
POST /stop_cameras          Stop cameras
POST /start_recording       Start recording
POST /stop_recording        Stop recording
POST /reset_order           Reset order code
GET  /video_feed            MJPEG stream
GET  /status                Realtime status API
```

### C. Files Location

**Development:**
```
eco_hub_demo/
├── config.json
├── config.key
└── videos/
```

**Production (PyInstaller):**
```
C:\Users\<user>\EcoHub_QR_Scanner\
├── config.json
├── config.key
└── videos\
```

**Installed:**
```
C:\Program Files\EcoHub QR Scanner\
├── EcoHub_QR_Scanner.exe
└── _internal\
    ├── static\
    ├── templates\
    ├── config.json (default)
    └── config.key (default)
```

### D. Dependencies Version

```
Python: 3.11.x
Flask: 2.3.0+
OpenCV: Latest
ZXing-CPP: 2.2.0+
Boto3: 1.28.0+
Cryptography: 41.0.0+
NumPy: Latest
PyInstaller: 6.0.0+ (build only)
Inno Setup: 6.7.0 (installer only)
```

### E. Browser Support

- Chrome/Edge: ✅ Recommended
- Firefox: ✅ OK
- Safari: ⚠️ Limited MJPEG support

### F. Camera Support

**Tested:**
- Logitech C920
- Generic USB webcam
- RTSP IP cameras (Hikvision, Dahua)

**Requirements:**
- Resolution: 640x480 minimum, 1920x1080 maximum
- FPS: 15+ FPS
- Format: MJPEG, H.264

---

## 📄 LICENSE

Copyright © 2026 EcoHub Team. All rights reserved.

---

**Phiên bản:** 1.0.0  
**Cập nhật:** 09/02/2026  
**Tác giả:** EcoHub Development Team
