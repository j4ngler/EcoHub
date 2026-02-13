# 🔨 HƯỚNG DẪN BUILD ECOHUB QR SCANNER

## 📋 **YÊU CẦU:**

### **1. Python Dependencies**
```bash
pip install -r requirements.txt
pip install pyinstaller>=6.0.0
```

### **2. Inno Setup (Tạo installer)**
- Download: https://jrsoftware.org/isdl.php
- Cài đặt vào: `C:\Program Files (x86)\Inno Setup 6\`

---

## 🚀 **CÁCH BUILD:**

### **Bước 1: Build file .EXE**

```bash
# Windows (Tự động):
build_exe.bat

# Hoặc manual:
pip install pyinstaller
pyinstaller build.spec --clean
```

**Script sẽ:**
1. Check PyInstaller
2. Install dependencies
3. Clean old build folders
4. Build EXE với PyInstaller

**Kết quả:**
- File EXE: `dist\EcoHub_QR_Scanner\EcoHub_QR_Scanner.exe` (19 MB)
- Internal: `dist\EcoHub_QR_Scanner\_internal\` (200+ MB)
  - ✅ `static/` folder
  - ✅ `templates/` folder
  - ✅ `config.json` (default)
  - ✅ `config.key` (encryption key)
  - Python runtime + dependencies

**Tổng kích thước:** ~220-250 MB

---

### **Bước 2: Test EXE**

```bash
cd dist\EcoHub_QR_Scanner
EcoHub_QR_Scanner.exe
```

**Console output mong đợi:**
```
[STARTUP] BASE_DIR: C:\Users\...\AppData\Local\Temp\_MEI123456
[STARTUP] Templates: ...\Temp\_MEI123456\templates
[STARTUP] Static: ...\Temp\_MEI123456\static
[STARTUP] Videos: C:\Users\<user>\EcoHub_QR_Scanner\videos
[STARTUP] Copied default config.json to C:\Users\<user>\EcoHub_QR_Scanner\config.json
[STARTUP] Copied config.key to C:\Users\<user>\EcoHub_QR_Scanner\config.key

============================================================
  ECOHUB QR SCANNER - READY
============================================================
  URL: http://127.0.0.1:5000
  Camera Status: NOT STARTED (manual start required)
  S3 Status: NOT CONFIGURED / CONFIGURED
============================================================

 * Running on http://127.0.0.1:5000
```

**Kiểm tra:**
- ✅ App mở được (không lỗi Templates/Static)
- ✅ Console hiện logs
- ✅ Browser tự động mở http://127.0.0.1:5000
- ✅ Templates render được (không lỗi TemplateNotFound)
- ✅ Static files load được (CSS/JS)
- ✅ Config files copy vào `C:\Users\<user>\EcoHub_QR_Scanner\`
- ✅ Camera test được (từ Settings)
- ✅ S3 config lưu được

---

### **Bước 3: Build Installer Setup**

```bash
# Windows (Tự động):
build_installer.bat

# Hoặc manual:
"C:\Program Files (x86)\Inno Setup 6\ISCC.exe" setup.iss
```

**Script sẽ:**
1. Check Inno Setup installation
2. Check EXE exists
3. Compress tất cả files (LZMA)
4. Build installer

**Kết quả:**
- File installer: `installer_output\EcoHub_QR_Scanner_Setup_v1.0.0.exe`
- Kích thước: ~88 MB (compressed từ 220 MB)
- Người dùng chỉ cần double-click để cài đặt!

---

## 📦 **CẤU TRÚC SAU KHI BUILD:**

```
eco_hub_demo/
├── dist/
│   └── EcoHub_QR_Scanner/       ← Folder chứa EXE + dependencies
│       ├── EcoHub_QR_Scanner.exe  ← File chạy chính
│       ├── templates/
│       ├── static/
│       ├── config.json
│       ├── _internal/            ← Python runtime + libraries
│       │   ├── python311.dll
│       │   ├── cv2/
│       │   ├── flask/
│       │   ├── boto3/
│       │   └── ...
│       └── videos/              ← Folder lưu videos
│
├── installer_output/
│   └── EcoHub_QR_Scanner_Setup_v1.0.0.exe  ← INSTALLER
│
├── build.spec                   ← PyInstaller config
├── build_exe.bat                ← Script build EXE
├── build_installer.bat          ← Script build installer
└── setup.iss                    ← Inno Setup config
```

---

## 🎯 **SAU KHI CÀI ĐẶT:**

User chạy installer → Cài vào `C:\Program Files\EcoHub QR Scanner\`

```
C:\Program Files\EcoHub QR Scanner\
├── EcoHub_QR_Scanner.exe  ← Double-click để chạy
├── config.json
├── templates/
├── static/
├── videos/                ← Tự động tạo
└── _internal/
```

---

## ⚙️ **TÙY CHỈNH:**

### **Đổi tên app:**
Sửa trong `setup.iss`:
```iss
#define MyAppName "Tên App Của Bạn"
#define MyAppVersion "1.0.0"
```

### **Thêm icon:**
1. Tạo file `icon.ico` (256x256)
2. Sửa `build.spec`: `icon='icon.ico'`
3. Sửa `setup.iss`: `SetupIconFile=icon.ico`

### **Ẩn console:**
Sửa `build.spec`: `console=False` (chỉ hiện GUI)

---

## 🐛 **XỬ LÝ LỖI:**

### **Lỗi 1: "Python not found"**
```bash
# Cài Python 3.11
# Add Python to PATH
```

### **Lỗi 2: "Module not found"**
```bash
pip install -r requirements.txt
pip install pyinstaller
```

### **Lỗi 3: "Inno Setup not found"**
```bash
# Download: https://jrsoftware.org/isdl.php
# Cài vào: C:\Program Files (x86)\Inno Setup 6\
```

### **Lỗi 4: "OpenCV DLL error"**
```bash
# Thêm vào build.spec:
binaries=[
    ('C:/path/to/opencv_videoio_ffmpeg470_64.dll', '.'),
],
```

---

## 📝 **CHECKLIST TRƯỚC KHI PHÂN PHỐI:**

- [ ] Test EXE trên máy không có Python
- [ ] Test camera USB và RTSP
- [ ] Test S3 upload/download/delete
- [ ] Test tất cả tính năng (QR scan, record, settings)
- [ ] Thêm icon cho app (icon.ico)
- [ ] Tạo README cho user
- [ ] Test installer trên máy sạch (fresh Windows)

---

## 🎁 **FILE PHÂN PHỐI:**

**Gửi cho user:**
```
EcoHub_QR_Scanner_Setup_v1.0.0.exe  (200-300 MB)
```

**User làm gì:**
1. Double-click installer
2. Next → Next → Install
3. Chạy app từ Desktop hoặc Start Menu
4. Cấu hình camera + S3
5. Bắt đầu sử dụng!

---

## 🚀 **BUILD NGAY:**

```bash
# Bước 1: Build EXE
build_exe.bat

# Bước 2: Test EXE
dist\EcoHub_QR_Scanner\EcoHub_QR_Scanner.exe

# Bước 3: Build Installer
build_installer.bat

# Kết quả:
installer_output\EcoHub_QR_Scanner_Setup_v1.0.0.exe
```

**Xong!** 🎉
