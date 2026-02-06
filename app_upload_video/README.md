## EcoHub Demo - Packaging App

### Chạy demo:

```bash
cd swift_hub_demo
pip install -r requirements.txt
python app.py
```

Sau đó mở trình duyệt:

```text
http://localhost:5000
```

### Yêu cầu

1. **Python 3.10+**
2. **USB webcam** (độ phân giải 1280x720) hoặc **camera RTSP**
3. **opencv-contrib-python** (nếu quay video bị lỗi)
   - Nếu gặp lỗi "Không khởi tạo được VideoWriter", chạy:
     ```bash
     pip uninstall opencv-python
     pip install opencv-contrib-python
     ```

### Tính năng

- **Quét mã QR/Barcode realtime** với AI (hỗ trợ đa camera)
- **Quay video đóng gói** với resume/append video cũ (dùng FFmpeg concat)
- **Quản lý storage** local: giới hạn 1GB, tự động xóa video cũ hơn 20 ngày
- **Lưu cấu hình camera tự động** vào `config.json`: khi restart Flask, cài đặt sẽ tự động load lại
- **Tự động chọn codec tối ưu**: Ưu tiên MP4/H264 (nhỏ), fallback AVI/MJPEG (lớn nhưng ổn định)

### Dung lượng video

Ứng dụng tự động chọn codec theo thứ tự ưu tiên (1280x720, 20fps):
1. **MP4V/H264/X264 (MP4)**: 1-5 MB/phút ✅ (ưu tiên)
2. **MJPEG (AVI)**: 50-200 MB/phút (backup nếu MP4 lỗi)

**Lưu ý:** Nếu video lưu dạng AVI/MJPEG (file rất lớn), cài `opencv-contrib-python` để dùng MP4:
```bash
pip uninstall opencv-python
pip install opencv-contrib-python
```

### Cấu trúc dữ liệu

- `videos/` - Video đóng gói (local storage)
- `config.json` - Cấu hình camera (số lượng, nguồn USB/RTSP, độ nhạy quét mã)

