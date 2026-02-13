# 🎥 EcoHub QR Scanner

Ứng dụng quét mã QR/Barcode, tự động quay video đóng gói và upload lên S3 storage.

---

## ⚡ Quick Start

### 🔧 Development

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Run app
python app.py

# 3. Open browser
http://127.0.0.1:5000
```

### 📦 Build & Deploy

```bash
# 1. Build EXE
build_exe.bat

# 2. Test EXE
dist\EcoHub_QR_Scanner\EcoHub_QR_Scanner.exe

# 3. Build Installer
build_installer.bat

# 4. Result
installer_output\EcoHub_QR_Scanner_Setup_v1.0.0.exe
```

---

## ✨ Features

- 🎥 **Camera USB/RTSP** - Tối đa 2 cameras
- 🤖 **AI QR Scanner** - ZXing-CPP, 5 FPS
- 📹 **Auto Recording** - 15 FPS, async thread
- ☁️ **S3 Upload** - Multipart, retry mechanism
- 🔐 **Encrypted Config** - Fernet encryption
- 🕐 **GMT+7 Timezone** - Timestamp chính xác
- 🔄 **Upload History** - Daily cleanup at 00:00
- ⚙️ **Safe Startup** - Manual camera start

---

## 📚 Documentation

- **[📘 DOCS.md](DOCS.md)** - Tài liệu đầy đủ hệ thống
- **[🔨 BUILD_GUIDE.md](BUILD_GUIDE.md)** - Hướng dẫn build EXE/Installer
- **[🎥 CAMERA_SAFE_START.md](CAMERA_SAFE_START.md)** - Camera safe startup
- **[🔧 PYINSTALLER_FIX.md](PYINSTALLER_FIX.md)** - PyInstaller paths fix
- **[📝 TAI_LIEU_S3_BACKEND.md](../TAI_LIEU_S3_BACKEND.md)** - S3 backend docs

---

## 🏗️ Tech Stack

```
Frontend: HTML5 + Bootstrap 5 + JavaScript
Backend:  Flask 2.3.0 + Python 3.11
Camera:   OpenCV + ZXing-CPP 2.2.0
Storage:  Boto3 + S3-compatible
Security: Cryptography (Fernet)
```

---

## 📁 Project Structure

```
eco_hub_demo/
├── app.py                  # Main Flask app
├── config.json             # Configuration
├── camera/                 # Camera modules
│   ├── camera_manager.py   # Camera stream
│   ├── ai_scanner.py       # AI QR scanner
│   └── recorder.py         # Video recorder
├── services/               # Business logic
│   ├── s3_service.py       # S3 operations
│   └── config_encryption.py# Encryption
├── templates/              # HTML templates
├── static/                 # CSS/JS
├── build.spec              # PyInstaller config
├── setup.iss               # Inno Setup config
└── videos/                 # Local storage
```

---

## 🎯 Workflow

```
1. Quét QR code đơn hàng
      ↓
2. Auto detect → Auto start recording
      ↓
3. Nhân viên đóng gói (15-30s)
      ↓
4. Click "Kết thúc" → Stop recording
      ↓
5. Auto upload to S3
      ↓
6. Cooldown 5 phút → Ready cho đơn tiếp theo
```

---

## ⚙️ Configuration

### Camera Settings
```json
{
  "source_type": "usb",      // "usb" hoặc "rtsp"
  "camera_index": 0,         // USB: 0, 1, 2...
  "rtsp_url": "",            // RTSP: rtsp://...
  "width": 1280,
  "height": 720,
  "fps": 30
}
```

### S3 Settings
```json
{
  "endpoint": "https://s3.amazonaws.com",
  "region": "ap-southeast-1",
  "bucket": "your-bucket",
  "access_key_encrypted": "...",
  "secret_key_encrypted": "..."
}
```

---

## 🚀 Usage

### First Time Setup

1. **Khởi động app**
2. **Login** (username bất kỳ)
3. **Vào ⚙️ Cài đặt camera:**
   - Click "Test Camera"
   - Click "Start Camera"
   - Cấu hình USB/RTSP
4. **Vào ☁️ Cài đặt S3:**
   - Nhập credentials
   - Click "Test kết nối"
   - Click "Lưu"

### Daily Use

1. **Dashboard** → Camera live feed
2. **Quét QR** → Auto start recording
3. **Click "Kết thúc"** → Save & upload
4. **Kho lưu trữ** → Xem videos

---

## 🐛 Troubleshooting

### Camera không khởi động
```bash
1. Check USB connection
2. Close other apps using camera (Skype, Zoom...)
3. Restart app
```

### S3 upload failed
```bash
1. Vào "Cài đặt S3"
2. Click "Test kết nối"
3. Check Access Key, Secret Key, Bucket name
4. Check IAM permissions
```

### Video lag
```bash
# Đã fix trong camera_manager.py
cap.set(cv2.CAP_PROP_BUFFERSIZE, 0)
```

---

## 📦 Build Requirements

### EXE Build
- Python 3.11
- PyInstaller 6.0.0+

### Installer Build
- Inno Setup 6.7.0
- Download: https://jrsoftware.org/isdl.php

---

## 🔐 Security

- **Config Encryption**: Fernet symmetric encryption
- **S3 Credentials**: Encrypted in config.json
- **Encryption Key**: `config.key` (44 bytes)
- **User Storage**: `C:\Users\<user>\EcoHub_QR_Scanner\`

---

## 📊 Performance

- **Camera FPS**: 15-30 FPS
- **AI Scanner**: 5 FPS (timestamp-based)
- **Recording**: 15 FPS (async thread)
- **Upload**: Multipart (50MB threshold, 10MB chunks)
- **Memory**: Periodic cleanup (60s interval)

---

## 🎬 Threading Model

```
Main Thread:        Flask HTTP Server
Camera Threads:     Read frames (1-2 threads)
AI Scanner Threads: QR detection (1-2 threads)
Recorder Thread:    Video writing (1 thread)
Upload Thread:      S3 upload worker (1 thread)
```

---

## 📝 Version History

### v1.0.0 (09/02/2026)
- ✅ Initial release
- ✅ USB/RTSP camera support (max 2)
- ✅ ZXing-CPP QR scanner
- ✅ Async video recorder
- ✅ S3 upload with retry
- ✅ Safe camera startup
- ✅ Upload history with daily cleanup
- ✅ GMT+7 timezone
- ✅ PyInstaller build support
- ✅ Inno Setup installer

---

## 🤝 Contributing

Dự án nội bộ - EcoHub Team only.

---

## 📞 Support

**Console Logs:**
```bash
# Development
python app.py

# Production
EcoHub_QR_Scanner.exe
```

**Common Issues:**
- Check `DOCS.md` → Section 9: Xử lý sự cố
- Check console logs
- Check camera permissions
- Check S3 credentials

---

## 📄 License

Copyright © 2026 EcoHub Team. All rights reserved.

---**Tác giả:** EcoHub Development Team  
**Version:** 1.0.0  
**Updated:** 09/02/2026
