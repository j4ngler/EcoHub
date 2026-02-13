# 👤 HƯỚNG DẪN SỬ DỤNG - ECOHUB QR SCANNER

**Dành cho người dùng cuối (End User)**

---

## 📦 CÀI ĐẶT

### Bước 1: Chạy Installer

1. Double-click file `EcoHub_QR_Scanner_Setup_v1.0.0.exe`
2. Chọn **Next**
3. Chọn thư mục cài đặt (mặc định: `C:\Program Files\EcoHub QR Scanner\`)
4. Chọn **Install**
5. Đợi cài đặt hoàn tất (~1-2 phút)
6. Chọn **Finish**

### Bước 2: Khởi động App

**Cách 1:** Double-click icon "EcoHub QR Scanner" trên **Desktop**

**Cách 2:** Start Menu → Tìm "EcoHub QR Scanner" → Click

**App sẽ:**
- Mở console window (hiển thị logs)
- Tự động mở browser: http://127.0.0.1:5000
- Hiển thị trang login

---

## 🔐 ĐĂNG NHẬP

1. Nhập **Username** (bất kỳ, ví dụ: `admin`)
2. Click **"Đăng nhập"**
3. Vào trang **Dashboard**

---

## ⚙️ CẤU HÌNH LẦN ĐẦU

### 1️⃣ Cài đặt Camera

#### **Bước 1: Vào menu**
- Click **"⚙️ Cài đặt camera"** trên thanh menu

#### **Bước 2: Test Camera**
- Click nút **"Test Camera"**
- Chờ 1-2 giây
- Kết quả:
  - ✅ **"Camera OK (usb)"** → Camera hoạt động bình thường
  - ❌ **"Lỗi camera: ..."** → Camera có vấn đề

**Nếu lỗi camera:**
```
1. Kiểm tra camera USB đã cắm chưa
2. Kiểm tra camera có đang được dùng bởi app khác không (Skype, Zoom, Teams...)
3. Thử lại "Test Camera"
```

#### **Bước 3: Start Camera**
- Click nút **"Start Camera"**
- Confirm "Bắt đầu camera?"
- Đợi 2-3 giây
- Page tự động reload
- **Xem trước** ở dưới cùng sẽ hiển thị hình ảnh camera

#### **Bước 4: Cấu hình Camera (tùy chọn)**

**Camera 1:**
- ☑ **Bật** (đã bật mặc định)
- Chọn nguồn: **[USB]** hoặc **[RTSP]**
- USB: Chọn Camera 0, 1, 2...
- RTSP: Nhập URL `rtsp://...`

**Camera 2:**
- ☐ **Bật** để thêm camera thứ 2
- Tương tự Camera 1

**Độ nhạy AI:**
- **Thấp** - Chậm nhưng chính xác
- **Trung bình** - Cân bằng (khuyến nghị)
- **Cao** - Nhanh nhưng tốn CPU

**Tự động quay:**
- ☑ **Bật** - Tự động quay khi quét được QR (khuyến nghị)
- ☐ **Tắt** - Phải click "Bắt đầu quay" manual

**Click "Áp dụng"** để lưu cấu hình.

---

### 2️⃣ Cài đặt S3 (Lưu trữ đám mây)

#### **Bước 1: Vào menu**
- Click **"☁️ Cài đặt S3"** trên thanh menu

#### **Bước 2: Nhập thông tin S3**

**Ví dụ với AWS S3:**
```
Endpoint:    https://s3.amazonaws.com
Region:      ap-southeast-1
Bucket:      my-video-bucket
Access Key:  AKIA...
Secret Key:  wJalrXUtn...
```

**Ví dụ với CMC Cloud S3:**
```
Endpoint:    https://s3.hcm-r2.cloud.cmctelecom.vn
Region:      hcm-r2
Bucket:      komex-demo-before-tet
Access Key:  <ask IT team>
Secret Key:  <ask IT team>
```

#### **Bước 3: Test kết nối**
- Click **"Test kết nối"**
- Đợi 2-3 giây
- Kết quả:
  - ✅ **"Kết nối S3 thành công"** → OK
  - ❌ **"Lỗi: ..."** → Check lại thông tin

#### **Bước 4: Lưu cấu hình**
- Click **"Lưu cấu hình"**
- Thông tin được mã hóa và lưu vào `config.json`

---

## 📹 SỬ DỤNG HÀNG NGÀY

### Dashboard

#### **1. Camera Live Feed**
- Hiển thị hình ảnh camera realtime
- AI tự động quét mã QR/Barcode
- Badge status:
  - 🟢 **"Đang chạy"** - Camera hoạt động
  - ⚪ **"Chưa khởi động"** - Camera chưa bật

#### **2. Mã đơn hiện tại**
- Hiển thị mã QR vừa quét
- Click **"Reset mã"** để xóa và quét lại

#### **3. Thông tin đơn hàng**
- Order ID
- Platform (Shopee, Lazada, TikTok...)
- Danh sách sản phẩm

#### **4. Quay video**
- **Trạng thái:**
  - ⚪ **Idle** - Không quay
  - 🔴 **Recording** - Đang quay
- **Thời gian:** 00:00 (đếm lên)
- **Nút:**
  - **"Bắt đầu quay"** - Manual start (nếu tắt auto-record)
  - **"Kết thúc"** - Stop recording

---

### Quy trình quay video tự động

#### **Bước 1: Quét QR code**
1. Nhân viên cầm QR code đơn hàng
2. Đưa QR code vào trước camera
3. AI tự động detect QR
4. **Mã đơn hiện tại** hiển thị mã vừa quét

#### **Bước 2: Tự động quay video**
- App **TỰ ĐỘNG** bắt đầu quay video
- Trạng thái chuyển sang 🔴 **Recording**
- Timer bắt đầu đếm: 00:01, 00:02, ...

#### **Bước 3: Nhân viên đóng gói**
- Nhân viên đóng gói đơn hàng vào túi/hộp
- Camera quay toàn bộ quá trình
- Thời gian: 15-30 giây

#### **Bước 4: Kết thúc quay**
- Click nút **"Kết thúc"**
- Confirm "Bạn có chắc muốn kết thúc quay?"
- Click **OK**

#### **Bước 5: Lưu & Upload tự động**
- Video lưu vào folder `videos/`
- **TỰ ĐỘNG upload lên S3**
- Thông báo: **"✅ In xong! Thời lượng: 25 giây"**
- **Mã đơn reset** → Sẵn sàng quét mã mới

#### **Bước 6: Cooldown**
- Hệ thống cooldown **5 phút**
- Nếu quét lại cùng mã trong 5 phút → **Không quay lại**
- Sau 5 phút → Có thể quét lại cùng mã

---

## 📦 KHO LƯU TRỮ

### Tab "Video trên S3"

**Hiển thị:**
- Danh sách videos đã upload lên S3
- Filename, Size, Last Modified
- Actions:
  - **Download** - Tải video về máy
  - **Delete** - Xóa video khỏi S3

**Cách dùng:**
1. Click tab **"Video trên S3"**
2. Xem danh sách videos
3. Click **"Download"** để tải video
4. Click **"Delete"** → Confirm → Xóa video

### Tab "Lịch sử upload"

**Hiển thị:**
- Tất cả videos trong ngày (00:00 - 23:59)
- Status:
  - ⏳ **Pending** - Chưa upload
  - ⬆️ **Uploading** - Đang upload (progress %)
  - ✅ **Success** - Upload thành công
  - ❌ **Failed** - Upload lỗi

**Cleanup tự động:**
- Vào **00:00 hàng ngày**
- Xóa tất cả lịch sử ngày hôm trước
- Bắt đầu ngày mới với lịch sử trống

**Cách dùng:**
1. Click tab **"Lịch sử upload"**
2. Xem status upload realtime
3. Nếu **Failed** → Check S3 credentials

---

## ⚙️ CÀI ĐẶT NÂNG CAO

### Camera Settings

#### **Test Camera**
- Kiểm tra camera có hoạt động không
- KHÔNG khởi động camera
- Nhanh (1-2 giây)

#### **Start Camera**
- Khởi động camera + AI scanner
- Bắt đầu quét QR tự động
- Chỉ click khi Test OK

#### **Stop Camera**
- Dừng camera + AI scanner
- App vẫn chạy bình thường
- Cần stop nếu muốn đổi config

#### **Cấu hình Camera**

**USB Camera:**
- Nguồn: [USB]
- Camera: Chọn Camera 0, 1, 2...

**RTSP Camera:**
- Nguồn: [RTSP]
- URL: `rtsp://admin:password@192.168.1.100:554/stream`

**Tips:**
- USB: Đơn giản, cắm và dùng
- RTSP: Cho camera IP, cần URL đúng

---

### S3 Settings

#### **Lấy thông tin S3:**
- Liên hệ IT team để lấy:
  - Endpoint URL
  - Region
  - Bucket name
  - Access Key
  - Secret Key

#### **Test kết nối:**
- Nhập đầy đủ thông tin
- Click **"Test kết nối"**
- Phải thấy **"✅ Kết nối S3 thành công"**

#### **Lưu cấu hình:**
- Click **"Lưu cấu hình"**
- Credentials được **mã hóa** và lưu
- Không cần nhập lại khi restart app

---

## 🐛 XỬ LÝ SỰ CỐ

### ❌ Camera không hoạt động

**Triệu chứng:**
- Test Camera → ❌ "Cannot open camera"
- Dashboard → "Camera chưa khởi động"

**Giải pháp:**
```
1. Kiểm tra camera USB đã cắm chưa
2. Device Manager → Cameras → Check driver
3. Đóng các app đang dùng camera (Skype, Zoom, Teams, Discord...)
4. Rút USB → Cắm lại
5. Restart app
6. Test Camera lại
```

---

### ❌ S3 upload failed

**Triệu chứng:**
- Lịch sử upload → ❌ Failed
- Console: "Access Denied" hoặc "NoSuchBucket"

**Giải pháp:**
```
1. Vào "☁️ Cài đặt S3"
2. Click "Test kết nối"
3. Nếu lỗi:
   - Check Access Key đúng chưa
   - Check Secret Key đúng chưa
   - Check Bucket name đúng chưa
   - Liên hệ IT để verify credentials
4. Nhập lại thông tin đúng
5. "Lưu cấu hình"
```

---

### ❌ Video bị lag / chậm

**Triệu chứng:**
- Video chậm hơn real-time 3-5 giây

**Giải pháp:**
```
✅ Đã fix trong phiên bản này
   - RTSP buffer = 0
   - Async recorder
   - Clear queue after recording

Nếu vẫn lag:
   - Check network (nếu RTSP)
   - Giảm resolution trong Settings
```

---

### ❌ Quét QR không được

**Triệu chứng:**
- Quét QR nhưng không detect

**Giải pháp:**
```
1. Check camera feed rõ nét không
2. Đưa QR code GẦN camera hơn (10-30 cm)
3. Đảm bảo ánh sáng đủ (không quá tối/sáng)
4. Thử tăng "Độ nhạy AI" lên "Cao" trong Settings
5. Nếu QR code vừa quét < 5 phút → Cooldown, đợi 5 phút
```

---

### ❌ App bị treo / crash

**Triệu chứng:**
- App không phản hồi
- Console window đóng đột ngột

**Giải pháp:**
```
1. Check console logs (nếu còn)
2. Restart app
3. Nếu vẫn treo:
   - Check camera connection
   - Check S3 credentials
   - Liên hệ IT support
```

---

## 💡 TIPS & TRICKS

### ✅ Tối ưu hiệu suất

1. **Dùng 1 camera** thay vì 2 (nếu không cần thiết)
2. **Resolution 1280x720** (khuyến nghị) thay vì 1920x1080
3. **Độ nhạy "Trung bình"** (khuyến nghị) thay vì "Cao"
4. **Đóng các app không cần thiết** khi chạy

### ✅ Quét QR nhanh hơn

1. **Đưa QR code thẳng trước camera** (không nghiêng)
2. **Khoảng cách 15-25 cm** (không quá gần/xa)
3. **Ánh sáng đủ** (không backlight)
4. **QR code rõ nét** (không nhăn, rách)

### ✅ Upload nhanh hơn

1. **Check internet speed** (upload speed)
2. **Nếu lỗi upload** → App sẽ tự động retry
3. **Videos upload tuần tự** → Đợi video hiện tại xong mới upload tiếp

---

## 📊 HIỂU STATUS

### Camera Status Badge

```
🟢 Đang chạy     - Camera đang hoạt động, có thể quét QR
⚪ Chưa khởi động - Camera chưa bật, vào Settings để start
```

### Recording Status

```
⚪ Idle          - Không đang quay, sẵn sàng bắt đầu
🔴 Recording     - Đang quay video
```

### Upload Status

```
⏳ Pending       - Video đang chờ upload
⬆️ Uploading 45% - Đang upload, progress 45%
✅ Success       - Upload thành công
❌ Failed        - Upload lỗi, sẽ retry
```

---

## 🔄 QUY TRÌNH HÀNG NGÀY

### Buổi sáng (Khởi động)

```
1. Mở app (double-click desktop icon)
2. Login
3. Check camera status → Đang chạy (nếu chưa → vào Settings start)
4. Check S3 status → Configured (nếu chưa → vào Settings config)
5. Sẵn sàng làm việc!
```

### Trong ngày (Đóng gói đơn hàng)

```
1. Chuẩn bị đơn hàng
2. Quét QR code đơn hàng → App tự động bắt đầu quay
3. Đóng gói đơn hàng vào túi/hộp
4. Click "Kết thúc" → Video lưu + upload
5. Cooldown 5 phút
6. Quét đơn tiếp theo
```

### Cuối ngày (Kiểm tra)

```
1. Vào "📦 Kho lưu trữ"
2. Tab "Lịch sử upload" → Check có Failed không
3. Nếu có Failed → Check S3, retry nếu cần
4. Tab "Video trên S3" → Verify videos đã upload
5. Đóng app hoặc để chạy qua đêm
```

### Nửa đêm (00:00)

```
App tự động:
1. Cleanup lịch sử upload ngày hôm trước
2. Bắt đầu lịch sử mới cho ngày mới
```

---

## ❓ FAQ (Câu hỏi thường gặp)

### Q1: Tôi có thể dùng camera điện thoại không?

**A:** Có, nếu điện thoại hỗ trợ RTSP streaming. Cài app như "IP Webcam" trên Android, lấy RTSP URL và cấu hình trong Settings.

---

### Q2: Video lưu ở đâu?

**A:** 
- **Local:** `C:\Users\<user>\EcoHub_QR_Scanner\videos\`
- **S3:** Upload tự động, xem trong tab "Video trên S3"

---

### Q3: Tôi có thể xóa videos local không?

**A:** Có, nhưng **không nên** xóa manual. App tự động xóa sau khi upload thành công lên S3.

---

### Q4: Làm sao biết video đã upload chưa?

**A:** Vào **"Kho lưu trữ"** → Tab **"Lịch sử upload"** → Check status:
- ✅ Success - Đã upload
- ⬆️ Uploading - Đang upload
- ⏳ Pending - Chưa upload

---

### Q5: Tại sao không quét lại cùng QR trong 5 phút?

**A:** **Cooldown mechanism** để tránh quay lại cùng đơn hàng nhiều lần. Nếu cần quét lại:
- Đợi 5 phút, hoặc
- Click "Reset mã" trước khi quét

---

### Q6: Có thể đổi thời gian Cooldown không?

**A:** Có, nhưng cần sửa code:
```python
# camera/ai_scanner.py
COOLDOWN_SECONDS = 5 * 60  # 5 phút → Đổi thành 2 * 60 (2 phút)
```
Rebuild app sau khi sửa.

---

### Q7: Tôi có thể thêm camera thứ 3 không?

**A:** Không, app giới hạn **tối đa 2 cameras**. Nếu cần thêm:
```python
# app.py
MAX_CAMERAS = 2  # Đổi thành 3
```
Rebuild app sau khi sửa.

---

### Q8: Camera bị disconnect giữa chừng?

**A:** 
1. Check USB connection
2. Check camera power
3. Vào Settings → Stop Camera → Start Camera lại

---

### Q9: Upload bị lỗi, làm sao retry?

**A:** App **TỰ ĐỘNG retry** 3 lần. Nếu vẫn lỗi:
1. Check internet connection
2. Check S3 credentials (Settings)
3. Video vẫn lưu local, sẽ retry khi app restart

---

### Q10: Làm sao gỡ cài đặt?

**A:** 
1. Start Menu → Tìm "EcoHub QR Scanner"
2. Right-click → Uninstall
3. Hoặc: Control Panel → Programs → Uninstall

---

## 📞 HỖ TRỢ

### Console Logs
- App hiển thị console window
- Logs realtime (màu xanh/đỏ)
- Copy logs để gửi IT nếu lỗi

### Liên hệ
- Email: support@ecohub.vn
- Phone: 1900-xxxx
- Team: EcoHub IT Support

---

## 📋 CHECKLIST HÀNG NGÀY

**Buổi sáng:**
- [ ] Mở app
- [ ] Login
- [ ] Check camera: ✅ Đang chạy
- [ ] Check S3: ✅ Configured

**Trong ngày:**
- [ ] Quét QR → Auto record
- [ ] Click "Kết thúc" sau khi đóng gói
- [ ] Verify upload: ✅ Success

**Cuối ngày:**
- [ ] Check "Lịch sử upload" → Không có Failed
- [ ] Check "Video trên S3" → Tất cả videos có
- [ ] Đóng app hoặc để chạy qua đêm

---

**Phiên bản:** 1.0.0  
**Cập nhật:** 09/02/2026  
**Team:** EcoHub Support
