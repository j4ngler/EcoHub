# ⚡ QUICK REFERENCE - ECOHUB QR SCANNER

---

## 🚀 KHỞI ĐỘNG NHANH

### Development
```bash
python app.py
→ http://127.0.0.1:5000
```

### Production
```bash
EcoHub_QR_Scanner.exe
→ Auto open browser
```

---

## 🎯 WORKFLOW

```
1. Quét QR      → AI detect
2. Auto record  → Đóng gói
3. Stop record  → Save video
4. Auto upload  → S3 storage
5. Cooldown 5m  → Ready
```

---

## 🔧 CÀI ĐẶT LẦN ĐẦU

### Camera
```
⚙️ Cài đặt camera
→ Test Camera
→ Start Camera (nếu OK)
→ Cấu hình USB/RTSP
→ Áp dụng
```

### S3
```
☁️ Cài đặt S3
→ Nhập credentials
→ Test kết nối
→ Lưu cấu hình
```

---

## 📍 MENU NAVIGATION

```
🏠 Dashboard
   - Camera live feed
   - QR code hiện tại
   - Quay video
   - Thông tin đơn

⚙️ Cài đặt camera
   - Test/Start/Stop camera
   - Cấu hình camera (max 2)
   - Độ nhạy AI
   - Auto-record toggle

📦 Kho lưu trữ
   - Tab: Video trên S3
   - Tab: Lịch sử upload

☁️ Cài đặt S3
   - S3 credentials
   - Test connection
```

---

## ⌨️ SHORTCUTS

Không có keyboard shortcuts.
Sử dụng mouse/touch.

---

## 🔑 CONFIG FILES

### Development
```
eco_hub_demo/
├── config.json     Configuration
├── config.key      Encryption key
└── videos/         Local videos
```

### Production
```
C:\Users\<user>\EcoHub_QR_Scanner\
├── config.json
├── config.key
└── videos\
```

---

## 📊 STATUS INDICATORS

### Camera Badge
```
✅ Đang chạy    = Camera ON
⚪ Chưa khởi động = Camera OFF
```

### Recording Status
```
🔴 Recording     = Đang quay
⚪ Idle          = Không quay
```

### Upload Status
```
⏳ Pending       = Chưa upload
⬆️ Uploading     = Đang upload (%)
✅ Success       = Upload thành công
❌ Failed        = Upload lỗi
```

---

## 🐛 XỬ LÝ LỖI NHANH

### Camera không khởi động
```bash
1. Cắm lại USB
2. Đóng Skype/Zoom
3. Restart app
```

### S3 upload failed
```bash
1. Check credentials (Cài đặt S3)
2. Test connection
3. Check IAM permissions
```

### Video bị lag
```bash
# Đã fix - RTSP buffer = 0
# Nếu vẫn lag: Giảm FPS
```

### Templates not found
```bash
# Rebuild
pyinstaller build.spec --clean
```

---

## 📞 CONSOLE LOGS

### Normal
```
[STARTUP] Config loaded
[CAMERA DEBUG] fps=30, queue=1/2
[AI DEBUG] fps=5.0, t_total=0.189s
[UPLOAD WORKER] Success: video.mp4
```

### Errors
```
[ERROR] Cannot open camera
[ERROR] S3 upload failed
[ERROR] Templates not found
```

---

## 🔢 DEFAULT VALUES

```
Camera FPS:     30 (USB), 25 (RTSP)
AI FPS:         5
Recording FPS:  15
Resolution:     1280x720
Cooldown:       300s (5 minutes)
Buffer:         90 frames
Upload chunk:   10 MB
Upload threshold: 50 MB
```

---

## 📦 BUILD COMMANDS

### Build EXE
```bash
build_exe.bat
# hoặc
pyinstaller build.spec --clean
```

### Build Installer
```bash
build_installer.bat
# hoặc
"C:\Program Files (x86)\Inno Setup 6\ISCC.exe" setup.iss
```

### Clean Build
```bash
rmdir /s /q dist build
```

---

## 🔐 SECURITY

### Encrypted Fields
```
- S3 Access Key
- S3 Secret Key
```

### Encryption Method
```
Algorithm: Fernet (symmetric)
Key size:  44 bytes (base64)
Location:  config.key
```

---

## 🎛️ TUNING PARAMETERS

### Camera
```python
# camera_manager.py
width = 1280
height = 720
fps = 30
buffer_size = 0  # RTSP only
```

### AI Scanner
```python
# ai_scanner.py
TARGET_FPS = 5
COOLDOWN_SECONDS = 300
RESIZE_WIDTH = 480
```

### Recorder
```python
# recorder.py
RECORDING_FPS = 15.0
BUFFER_SIZE = 90
```

### S3 Upload
```python
# s3_service.py
MULTIPART_THRESHOLD = 50 * 1024 * 1024  # 50 MB
MULTIPART_CHUNKSIZE = 10 * 1024 * 1024  # 10 MB
```

---

## 📡 API ENDPOINTS

```
GET  /                  Login
GET  /dashboard         Dashboard
GET  /camera-settings   Camera settings
GET  /storage-settings  S3 settings
GET  /storage           Storage page
GET  /video_feed        MJPEG stream
GET  /status            Realtime status
GET  /upload-status     Upload status

POST /test_camera       Test camera
POST /start_cameras     Start cameras
POST /stop_cameras      Stop cameras
POST /start_recording   Start recording
POST /stop_recording    Stop recording
POST /reset_order       Reset order code
```

---

## 🔄 THREADING MODEL

```
1. Main Thread          Flask HTTP (port 5000)
2. Camera Thread 1-2    Read frames (10ms)
3. AI Thread 1-2        Scan QR (200ms)
4. Recorder Thread      Write video
5. Upload Thread        S3 upload worker
```

---

## 📏 LIMITS

```
Max cameras:        2
Max resolution:     1920x1080
Min resolution:     640x480
Max FPS:            30
Upload file size:   No limit (multipart)
Queue size:         Unlimited (disk space)
Cooldown:           5 minutes
Upload history:     1 day (auto-cleanup)
```

---

## 🌐 BROWSER SUPPORT

```
✅ Chrome/Edge      Recommended
✅ Firefox          OK
⚠️ Safari           Limited MJPEG
```

---

## 📞 SUPPORT

**Documentation:**
- README.md - Quick start
- DOCS.md - Full documentation
- BUILD_GUIDE.md - Build instructions

**Logs:**
```bash
# Dev
python app.py

# Prod
EcoHub_QR_Scanner.exe
```

**Config:**
```
Development: eco_hub_demo/config.json
Production:  C:\Users\<user>\EcoHub_QR_Scanner\config.json
```

---

**Version:** 1.0.0  
**Updated:** 09/02/2026
