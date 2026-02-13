# 📝 CHANGELOG

Tất cả thay đổi quan trọng của dự án được ghi lại trong file này.

---

## [1.0.0] - 2026-02-09

### 🎉 Initial Release

#### ✨ Tính năng mới

**Camera & AI:**
- ✅ Hỗ trợ camera USB và RTSP
- ✅ Tối đa 2 cameras đồng thời
- ✅ AI QR/Barcode scanner với ZXing-CPP
- ✅ FPS tối ưu: 5 FPS (AI), 15 FPS (recording)
- ✅ Cooldown 5 phút để tránh quét lại
- ✅ Frame resize tối ưu (480px width)

**Recording:**
- ✅ Tự động quay video khi quét QR
- ✅ Async recording với separate thread
- ✅ 90-frame buffer để không bị lag
- ✅ Pause AI scanner khi đang quay
- ✅ Clear frame queue sau khi stop

**S3 Upload:**
- ✅ S3-compatible storage support
- ✅ Upload queue với FIFO
- ✅ Multipart upload (50MB threshold)
- ✅ Retry mechanism cho failed uploads
- ✅ Presigned URL để download
- ✅ Fernet encryption cho credentials

**Upload History:**
- ✅ Hiển thị tất cả videos (pending/uploading/success/failed)
- ✅ Cleanup tự động vào 00:00 GMT+7 hàng ngày
- ✅ Status tracking với thread-safe locking

**Camera Management:**
- ✅ Safe startup: Không tự động bật camera
- ✅ Test camera trước khi start
- ✅ Start/Stop manual từ Settings page
- ✅ Camera status badge realtime

**UI/UX:**
- ✅ Bootstrap 5 responsive design
- ✅ Tabbed interface (S3 videos / Upload history)
- ✅ MJPEG streaming
- ✅ Realtime status updates (1s polling)

**Build & Deploy:**
- ✅ PyInstaller build support
- ✅ Inno Setup installer
- ✅ Path handling cho bundled app
- ✅ Config copy to user directory

#### 🐛 Bug Fixes

**Camera:**
- ✅ Fix RTSP buffer lag (set buffer size to 0)
- ✅ Fix camera thread interval (10ms)
- ✅ Fix frame queue race condition

**AI Scanner:**
- ✅ Fix continuous recording (add cooldown)
- ✅ Fix memory leak (periodic cleanup)
- ✅ Fix FPS drop (remove time.sleep)
- ✅ Switch from pyzbar to zxing-cpp (faster)

**Recording:**
- ✅ Fix recording lag (async recorder)
- ✅ Fix frame drop (90-frame buffer)
- ✅ Fix old frames after recording (clear queue)

**S3:**
- ✅ Fix settings lost on refresh (preserve s3_config)
- ✅ Fix Unicode errors (UTF-8 console)
- ✅ Fix timezone (GMT+7)

**PyInstaller:**
- ✅ Fix missing static/templates
- ✅ Fix missing config.key
- ✅ Fix Flask template path
- ✅ Fix writable config location

**UI:**
- ✅ Fix Vietnamese language in Inno Setup (remove)
- ✅ Fix upload status not showing (auto-queue local videos)

#### 🔧 Improvements

**Performance:**
- ✅ Timestamp-based FPS control (no blocking)
- ✅ Frame resize optimization (480px)
- ✅ Queue-based threading (camera → AI)
- ✅ Async video writer (separate thread)
- ✅ Memory leak prevention (periodic cleanup)

**Code Quality:**
- ✅ UTF-8 encoding for Windows console
- ✅ English messages (no Vietnamese in logs)
- ✅ Debug timing logs
- ✅ Thread safety with locks
- ✅ Error handling improvements

**Configuration:**
- ✅ Max 2 cameras (was 4)
- ✅ Camera controls moved to Settings
- ✅ Encrypted S3 credentials
- ✅ Config file in user directory

**Documentation:**
- ✅ DOCS.md - Full system documentation
- ✅ BUILD_GUIDE.md - Build instructions
- ✅ CAMERA_SAFE_START.md - Camera startup guide
- ✅ PYINSTALLER_FIX.md - Build fixes
- ✅ README.md - Quick start guide
- ✅ CHANGELOG.md - This file

---

## 📊 Statistics

**Total Changes:**
- Files modified: 15+
- Lines of code: ~5,000+
- Dependencies: 6 core + build tools
- Threads: 6-8 concurrent
- Build size: 88.5 MB (installer)

**Performance Metrics:**
- Camera read: 25-30 FPS
- AI scan: 5 FPS
- Recording: 15 FPS
- Upload: 10 MB/s chunks
- Memory: Stable (cleanup every 60s)

---

## 🔄 Migration Notes

### From Development to Production

1. **Config location changed:**
   ```
   Dev:  eco_hub_demo/config.json
   Prod: C:\Users\<user>\EcoHub_QR_Scanner\config.json
   ```

2. **Videos location changed:**
   ```
   Dev:  eco_hub_demo/videos/
   Prod: C:\Users\<user>\EcoHub_QR_Scanner\videos/
   ```

3. **Camera startup changed:**
   ```
   Before: Auto-start on app launch
   Now:    Manual start from Settings
   ```

4. **Upload history changed:**
   ```
   Before: 24-hour rolling window
   Now:    Daily cleanup at 00:00
   ```

---

## 🐛 Known Issues

Không có known issues trong v1.0.0.

---

## 🔮 Planned Features

### v1.1.0 (Future)
- [ ] Multiple S3 bucket support
- [ ] Video compression before upload
- [ ] Custom cooldown per QR code
- [ ] Export upload statistics
- [ ] Email notification on failed upload
- [ ] Camera preview in Settings page
- [ ] Dark mode UI

---

## 📞 Reporting Issues

Nếu phát hiện lỗi, vui lòng:
1. Check console logs
2. Check DOCS.md → Section 9: Xử lý sự cố
3. Liên hệ EcoHub Development Team

---

**Format:** [MAJOR.MINOR.PATCH]  
**Convention:** [Semantic Versioning 2.0.0](https://semver.org/)
