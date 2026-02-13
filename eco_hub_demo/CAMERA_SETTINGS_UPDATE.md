# 📝 CẬP NHẬT: CAMERA SETTINGS & MAX 2 CAMERAS

## 🎯 **CÁC THAY ĐỔI:**

### **1. Giới hạn tối đa 2 camera**
```python
# app.py
MAX_CAMERAS = 2  # Trước đây: 4
```

### **2. Di chuyển Camera Control từ Dashboard → Camera Settings**

**Trước đây:**
- ❌ Dashboard có: Camera Status Card + Test/Start/Stop buttons
- ❌ Rối, nhiều controls ở dashboard

**Hiện tại:**
- ✅ **Dashboard**: CHỈ hiển thị camera feed + status badge
- ✅ **Camera Settings**: Tất cả controls (Test/Start/Stop/Config)

---

## 📄 **CHI TIẾT THAY ĐỔI:**

### **A. `app.py`**

#### **1. Giảm MAX_CAMERAS:**
```python
MAX_CAMERAS = 2  # line 53
```

#### **2. Thêm camera_status vào camera_settings route:**
```python
# camera_settings() function
with camera_status_lock:
    cam_status = camera_status.copy()

return render_template(
    "camera_settings.html",
    # ... existing params ...
    camera_status=cam_status,  # ← Thêm này
)
```

---

### **B. `templates/dashboard.html`**

#### **Trước đây (BỎ ĐI):**
```html
<!-- Camera Status Card với Test/Start/Stop buttons -->
<div class="card">
  <button id="testCameraBtn">Test Camera</button>
  <button id="startCameraBtn">Start Camera</button>
  <button id="stopCameraBtn">Stop Camera</button>
</div>
```

#### **Hiện tại (ĐƠN GIẢN):**
```html
<!-- Camera Live Feed -->
<div class="card card-ecohub mb-4">
  <div class="card-header d-flex justify-content-between align-items-center">
    <span>Camera live + AI quét mã</span>
    <span class="badge {% if camera_status.running %}bg-success{% else %}bg-secondary{% endif %}">
      {% if camera_status.running %}Đang chạy{% else %}Chưa khởi động{% endif %}
    </span>
  </div>
  <div class="card-body p-0">
    {% if camera_status.running %}
      <!-- Camera feed -->
      <img src="{{ url_for('video_feed') }}" />
    {% else %}
      <!-- Placeholder -->
      <div class="p-5 text-center text-muted">
        <i class="bi bi-camera-video" style="font-size: 3rem;"></i>
        <p class="mt-3">Camera chưa khởi động</p>
        <p class="small">
          Vào <a href="{{ url_for('camera_settings') }}">⚙️ Cài đặt camera</a> để khởi động camera
        </p>
      </div>
    {% endif %}
  </div>
</div>
```

**Đặc điểm:**
- ✅ Badge hiển thị status (Đang chạy / Chưa khởi động)
- ✅ Link đến Camera Settings nếu chưa khởi động
- ✅ KHÔNG có buttons Test/Start/Stop

---

### **C. `templates/camera_settings.html`**

#### **1. Thêm Camera Control Panel (ĐẦU TIÊN):**
```html
<!-- Camera Control Panel -->
<div class="config-card">
  <div class="section-title d-flex justify-content-between align-items-center">
    <span>🎥 Điều khiển camera</span>
    <span id="cameraStatusBadge" class="badge {% if camera_status.running %}bg-success{% else %}bg-secondary{% endif %}">
      {% if camera_status.running %}Đang chạy{% else %}Chưa khởi động{% endif %}
    </span>
  </div>
  
  <div id="cameraStatusMessage" class="mb-3">
    {% if camera_status.running %}
      <div class="alert alert-success mb-0">
        <i class="bi bi-check-circle-fill"></i> Camera đang hoạt động bình thường
      </div>
    {% elif camera_status.error %}
      <div class="alert alert-danger mb-0">
        <i class="bi bi-exclamation-triangle-fill"></i> {{ camera_status.error }}
      </div>
    {% else %}
      <div class="alert alert-warning mb-0">
        <i class="bi bi-info-circle-fill"></i> Camera chưa khởi động. Nhấn "Test Camera" để kiểm tra, sau đó "Start Camera" để bắt đầu.
      </div>
    {% endif %}
  </div>
  
  <div class="d-flex gap-2 flex-wrap">
    <button id="testCameraBtn" class="btn btn-outline-primary">
      <i class="bi bi-check-circle"></i> Test Camera
    </button>
    <button id="startCameraBtn" class="btn btn-success" {% if camera_status.running %}disabled{% endif %}>
      <i class="bi bi-play-circle"></i> Start Camera
    </button>
    <button id="stopCameraBtn" class="btn btn-danger" {% if not camera_status.running %}disabled{% endif %}>
      <i class="bi bi-stop-circle"></i> Stop Camera
    </button>
  </div>
  
  <div id="cameraTestResult" class="mt-3" style="display: none;"></div>
</div>
```

#### **2. Cập nhật Preview Section:**
```html
<!-- Preview Section -->
<div class="preview-card">
  <div class="section-title">👁️ Xem trước</div>

  {% if camera_status.running %}
    <!-- Camera feed -->
    <img src="{{ url_for('video_feed') }}" />
  {% else %}
    <!-- Placeholder -->
    <div class="p-5 text-center text-muted">
      <i class="bi bi-camera-video-off" style="font-size: 3rem;"></i>
      <p class="mt-3">Camera chưa khởi động</p>
      <p class="small">Start camera ở phần trên để xem trước</p>
    </div>
  {% endif %}
</div>
```

#### **3. Thêm JavaScript cho Camera Controls:**
```javascript
// Test Camera
document.getElementById('testCameraBtn').addEventListener('click', async () => {
  // ... fetch('/test_camera') ...
});

// Start Camera
document.getElementById('startCameraBtn').addEventListener('click', async () => {
  if (!confirm('Bắt đầu camera? Đảm bảo bạn đã cấu hình camera ở phía dưới.')) return;
  // ... fetch('/start_cameras') ...
});

// Stop Camera
document.getElementById('stopCameraBtn').addEventListener('click', async () => {
  if (!confirm('Dừng camera? Bạn sẽ không thể quét QR hoặc quay video.')) return;
  // ... fetch('/stop_cameras') ...
});
```

---

## 🗂️ **CẤU TRÚC MỚI:**

### **Dashboard (Đơn giản hơn):**
```
┌─────────────────────────────────────────────┐
│ Camera live + AI quét mã    [Đang chạy]    │
├─────────────────────────────────────────────┤
│                                             │
│  [Camera Feed / Preview]                    │
│                                             │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ Mã đơn hiện tại                            │
├─────────────────────────────────────────────┤
│ ORDER123                                    │
│ [Reset mã]                                 │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ Quay video                                  │
├─────────────────────────────────────────────┤
│ [Bắt đầu quay]  [Kết thúc]                 │
└─────────────────────────────────────────────┘
```

### **Camera Settings (Đầy đủ controls):**
```
┌─────────────────────────────────────────────┐
│ 🎥 Điều khiển camera        [Chưa khởi động]│
├─────────────────────────────────────────────┤
│ ⚠️ Camera chưa khởi động...                │
│                                             │
│ [Test Camera] [Start Camera] [Stop Camera] │
│                                             │
│ [Test Result]                               │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ 📹 Cấu hình camera (1/2)                    │
├─────────────────────────────────────────────┤
│ □ Camera 1  [USB] [RTSP]                   │
│ □ Camera 2  [USB] [RTSP]                   │
│                                             │
│ [Áp dụng] [Hủy]                            │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ 👁️ Xem trước                                │
├─────────────────────────────────────────────┤
│ [Camera Preview / Placeholder]              │
└─────────────────────────────────────────────┘
```

---

## 🔄 **WORKFLOW SỬ DỤNG:**

### **Khởi động lần đầu:**
1. **Mở app** → http://127.0.0.1:5000
2. **Login**
3. **Dashboard** → Thấy "Camera chưa khởi động" + link "⚙️ Cài đặt camera"
4. **Click link** → Đến Camera Settings
5. **Cấu hình camera** (USB/RTSP, max 2 cameras)
6. **Test Camera** → ✅ OK
7. **Start Camera** → Camera chạy
8. **Quay lại Dashboard** → Camera feed hiển thị

### **Thay đổi cấu hình:**
1. **Vào ⚙️ Cài đặt camera**
2. **Stop Camera** (nếu đang chạy)
3. **Thay đổi config** (USB ↔ RTSP)
4. **Áp dụng**
5. **Test Camera**
6. **Start Camera**

---

## 📊 **SO SÁNH:**

| **Trước đây** | **Hiện tại** |
|---------------|--------------|
| Max 4 cameras | Max **2 cameras** |
| Dashboard: Camera controls + Feed | Dashboard: **CHỈ camera feed** |
| Settings: Chỉ config | Settings: **Controls + Config** |
| Rối, nhiều nút ở dashboard | **Tách biệt rõ ràng** |

---

## ✅ **LỢI ÍCH:**

1. **Dashboard đơn giản hơn**
   - Chỉ hiển thị camera feed
   - Badge status nhỏ gọn
   - Link đến Settings nếu cần

2. **Camera Settings là trung tâm quản lý**
   - Test/Start/Stop controls
   - Camera config (USB/RTSP)
   - AI settings
   - Preview

3. **Logic rõ ràng**
   - **Dashboard**: XEM camera + Quét QR + Quay video
   - **Settings**: CÀI ĐẶT + ĐIỀU KHIỂN camera

4. **Max 2 cameras**
   - Phù hợp với use case thực tế
   - Giảm overhead

---

## 🧪 **TEST:**

### **Test 1: Dashboard đơn giản**
1. Start app (camera chưa bật)
2. Mở Dashboard
3. ✅ Thấy badge "Chưa khởi động"
4. ✅ Thấy placeholder + link "Cài đặt camera"
5. ✅ KHÔNG thấy Test/Start/Stop buttons

### **Test 2: Camera Settings đầy đủ**
1. Vào ⚙️ Cài đặt camera
2. ✅ Thấy "Điều khiển camera" card ở trên cùng
3. ✅ Thấy 3 buttons: Test/Start/Stop
4. ✅ Thấy config cho max 2 cameras
5. ✅ Thấy preview ở dưới

### **Test 3: Workflow hoàn chỉnh**
1. Dashboard → Link "Cài đặt camera"
2. Settings → Test Camera → ✅ OK
3. Settings → Start Camera → ✅ Started
4. Settings → Preview hiển thị camera feed
5. Dashboard → Camera feed hiển thị + badge "Đang chạy"
6. Settings → Stop Camera → ✅ Stopped
7. Dashboard → Placeholder hiển thị lại

---

## 📋 **FILES ĐÃ SỬA:**

1. **`app.py`**
   - `MAX_CAMERAS = 2`
   - Thêm `camera_status` vào `camera_settings()` route

2. **`templates/dashboard.html`**
   - Bỏ Camera Status Card
   - Bỏ Test/Start/Stop buttons
   - Bỏ JavaScript controls
   - Giữ camera feed + badge status
   - Thêm link đến Camera Settings

3. **`templates/camera_settings.html`**
   - Thêm Camera Control Panel (đầu tiên)
   - Thêm JavaScript cho Test/Start/Stop
   - Sửa Preview để check camera_status

---

## 🎉 **KẾT QUẢ:**

✅ **Max 2 cameras**
✅ **Dashboard đơn giản**
✅ **Camera Settings = trung tâm quản lý**
✅ **Logic rõ ràng, dễ sử dụng**

**App đang chạy:** http://127.0.0.1:5000
