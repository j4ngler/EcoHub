# Báo cáo tiến độ: Hệ thống giới hạn & giám sát dung lượng video

**Dự án:** EcoHub Demo  
**Nội dung:** Cơ chế giới hạn – giám sát – cảnh báo – tự động xử lý dung lượng video

---

## 1. Tổng quan

Đã xây dựng và tích hợp vào EcoHub Demo một hệ thống quản lý dung lượng video gồm:

- **Cấu hình giới hạn** (dung lượng GB, số lượng video, tổng thời lượng phút).
- **Thu thập và lưu metadata** từng video trong luồng quay/upload.
- **Tính toán usage** (dung lượng đã dùng, %, số video, tổng phút).
- **Auto cleanup** khi vượt ngưỡng (xóa video cũ nhất, đã upload, không tranh chấp).
- **Log audit** khi xóa video (ai, khi nào, vì sao).
- **API** trả về số liệu usage cho giao diện.
- **Dashboard & trang Storage** hiển thị thanh %, cảnh báo 70%/90%/100%.

---

## 2. Quá trình thực hiện & chi tiết từng hạng mục

Công việc được thực hiện theo thứ tự từ nền tảng đến giao diện:

| Bước | Nội dung | Ghi chú |
|------|----------|--------|
| 1 | Thiết kế cách cấu hình giới hạn dung lượng video | Tránh hard-code; chuẩn bị cho trường hợp nhiều shop |
| 2 | Thiết kế và tạo cấu trúc dữ liệu lưu thông tin video và log xóa video | Tối ưu cho việc truy vấn theo thời gian và theo shop |
| 3 | Gắn thu thập thông tin video vào luồng quay và upload hiện tại | Người dùng không phải thay đổi thao tác |
| 4 | Xây dựng cơ chế tính toán tổng dung lượng, số lượng và thời lượng video | Dùng làm “trung tâm số liệu” cho cả backend và giao diện |
| 5 | Thiết kế luật tự động dọn dẹp video khi gần đầy | Ưu tiên xóa video cũ, đã an toàn trên cloud, không tranh chấp |
| 6 | Gắn cơ chế dọn dẹp vào các điểm phù hợp trong luồng xử lý | Kiểm tra tự động sau khi quay hoặc upload xong |
| 7 | Bổ sung cơ chế ghi nhật ký (audit) khi xóa video | Đảm bảo truy vết được mọi thao tác xóa |
| 8 | Tạo API để cung cấp số liệu dung lượng cho giao diện | Chuẩn bị cho dashboard và công cụ giám sát khác |
| 9 | Hiển thị dung lượng và cảnh báo trên Dashboard | Người dùng nhìn một card là hiểu ngay tình trạng kho video |
| 10 | Hiển thị dung lượng và cảnh báo trên trang Storage, có tự động cập nhật | Phù hợp cho người vận hành theo dõi liên tục |
| 11 | Mở rộng luật dọn dẹp để xét thêm số lượng video và tổng thời lượng | Giới hạn linh hoạt hơn, không chỉ dựa trên dung lượng GB |

Chi tiết cho từng hạng mục:

### Cấu hình giới hạn dung lượng video

- Xác định cách đặt các ngưỡng giới hạn: theo dung lượng GB, theo số lượng video tối đa, theo tổng số phút quay.
- Thống nhất cách lưu cấu hình trong file cấu hình chung, có thể dễ dàng sửa đổi khi cần.
- Thiết kế theo hướng sau này có thể tùy biến riêng cho từng shop mà không phải viết lại logic.

### Lưu trữ thông tin từng video

- Mỗi video khi tạo ra đều có một “hồ sơ” riêng, lưu các thông tin như:
  - Dung lượng file, thời lượng, thời điểm tạo.
  - Thuộc về đơn hàng hay đối tượng nào (nếu có).
  - Đã được upload lên cloud hay chưa.
  - Có đang nằm trong diện tranh chấp hay không.
  - Đã bị xóa khỏi máy hay vẫn còn.
- Bên cạnh đó, có thêm một nơi lưu toàn bộ lịch sử xóa video (log), ghi lại: video nào bị xóa, lúc nào, vì lý do gì và do hệ thống hay người dùng thực hiện.

### Thu thập dữ liệu trong luồng quay và upload

- Khi người dùng dừng quay, hệ thống tự động:
  - Kiểm tra file video vừa tạo,
  - Tính toán dung lượng và thời lượng,
  - Ghi một bản ghi mới vào “hồ sơ video”.
- Khi video được upload lên cloud thành công, hệ thống cập nhật trạng thái tương ứng trong hồ sơ.
- Tất cả diễn ra ngầm, không yêu cầu người dùng thao tác thêm.

### Tính toán tình trạng sử dụng dung lượng

- Dựa trên toàn bộ hồ sơ video hiện chưa bị đánh dấu xóa, hệ thống:
  - Cộng tổng dung lượng để biết đang chiếm bao nhiêu GB.
  - Đếm số lượng video.
  - Cộng tổng thời lượng để biết tổng số phút quay.
- Các con số này được so sánh với các ngưỡng cấu hình để tính ra phần trăm sử dụng theo:
  - Dung lượng (GB),
  - Số video,
  - Tổng thời lượng.
- Đây là nguồn số liệu duy nhất được dùng cho cả API và cơ chế dọn dẹp.

### Cơ chế tự động dọn dẹp video

- Khi kho video tiến gần đến giới hạn (từ 95% trở lên) theo bất kỳ tiêu chí nào (dung lượng, số lượng, thời lượng), hệ thống sẽ kích hoạt dọn dẹp.
- Quy tắc dọn dẹp:
  - Chỉ xét những video đã upload lên cloud và không bị đánh dấu tranh chấp.
  - Ưu tiên xóa từ video cũ nhất trở đi.
  - Sau mỗi lần xóa, tính lại tổng dung lượng, số lượng và thời lượng.
  - Dừng lại khi tất cả các chỉ số đã quay về dưới ngưỡng an toàn.
- Cách làm này giúp giảm rủi ro mất dữ liệu quan trọng và tập trung xóa những video ít giá trị hơn.

### Gắn dọn dẹp vào luồng xử lý

- Sau khi quay xong một video mới, hệ thống:
  - Ghi nhận thêm dung lượng vừa phát sinh,
  - Ngay lập tức kiểm tra xem kho video có đang tiến gần hoặc vượt giới hạn hay không.
- Sau khi upload video lên cloud thành công, hệ thống:
  - Đánh dấu video đó an toàn trên cloud,
  - Kiểm tra lại một lần nữa để xem có cần giải phóng dung lượng local hay không.
- Nhờ đó, việc dọn dẹp diễn ra vào những thời điểm tự nhiên, không làm gián đoạn người dùng.

### Nhật ký (audit) khi xóa video

- Mỗi lần video bị xóa khỏi máy, dù là do cơ chế tự động hay do người dùng thao tác, đều được ghi lại với các thông tin:
  - Video nào, thuộc shop nào, đường dẫn file.
  - Lý do xóa (tự động do vượt ngưỡng, hay xóa thủ công).
  - Thời điểm xóa.
  - Thực thể thực hiện: hệ thống hay tài khoản người dùng.
- Đây là căn cứ quan trọng để:
  - Tra soát khi có sự cố hoặc khiếu nại.
  - Đảm bảo tính minh bạch trong vận hành.

### Cung cấp số liệu qua API

- Xây dựng một điểm truy cập cho phép:
  - Lấy bức tranh tổng quan về kho video: dung lượng, số lượng, thời lượng và phần trăm so với giới hạn.
  - Hỗ trợ cả chế độ xem chung toàn hệ thống, hoặc sau này có thể lọc theo từng shop.
- API chỉ cho phép gọi khi người dùng đã đăng nhập, tránh lộ thông tin nội bộ.

### Hiển thị trên Dashboard

- Thêm một thẻ thông tin trên màn hình tổng quan:
  - Hiển thị rõ ràng dung lượng đã dùng / giới hạn, số video và tổng thời lượng.
  - Có thanh phần trăm màu sắc thể hiện mức độ an toàn, cảnh báo sớm hay nguy hiểm.
  - Có phần cảnh báo bằng chữ giúp người dùng hiểu ngay tình trạng hiện tại.
- Dữ liệu được lấy trực tiếp từ API, cập nhật mỗi lần người dùng mở trang.

### Hiển thị trên trang Storage

- Bổ sung một khối hiển thị tương tự trên trang quản lý lưu trữ:
  - Tập trung vào phần dung lượng local trên máy.
  - Có cùng kiểu thanh phần trăm và cảnh báo như Dashboard để thống nhất trải nghiệm.
- Thông tin tại đây được tự động làm mới định kỳ, tiện cho người vận hành theo dõi liên tục trong quá trình quay và upload nhiều video.

---

## 3. Kỹ thuật sử dụng

### 3.1. Công nghệ / stack

| Thành phần | Công nghệ / cách làm |
|------------|----------------------|
| Backend | Python 3, Flask (route, session, jsonify) |
| Cấu hình | `config.json` (JSON), biến môi trường (ENV) cho override |
| Cơ sở dữ liệu | SQLite (file `video_metadata.db`), thư viện `sqlite3` chuẩn |
| Metadata & audit | Module `services/video_metadata.py`: dataclass, CRUD, `ensure_schema` khi khởi tạo |
| API | REST GET `/api/video_storage_usage`, query `shop_id` tùy chọn, trả về JSON |
| Giao diện | HTML (Jinja2), Bootstrap (progress bar, alert), JavaScript thuần (fetch API) |

### 3.2. Luồng dữ liệu chính

1. **Khi quay xong video:**  
   `stop_recording` → lấy size/duration file → `insert_video(...)` → tạo `UploadTask(video_id)` → (sau đó) gọi `enforce_video_storage_limit(None)`.

2. **Khi upload S3 xong:**  
   `upload_worker` gọi `mark_uploaded(..., video_id)` → gọi `enforce_video_storage_limit(None)`.

3. **Khi cần hiển thị số liệu:**  
   Trình duyệt gọi GET `/api/video_storage_usage` → backend gọi `get_video_storage_usage(shop_id)` (đọc limit từ config + đọc bảng `videos`) → trả JSON → JS điền vào card và vẽ thanh % + cảnh báo.

4. **Khi auto cleanup chạy:**  
   `enforce_video_storage_limit` gọi `get_video_storage_usage` → nếu vượt 95% (dung lượng hoặc count hoặc duration) → `list_active_videos_for_shop` (sắp cũ → mới) → lọc đã upload, không tranh chấp → lần lượt xóa file local, `mark_deleted`, `log_video_deletion` → cập nhật biến used/count/duration trong vòng lặp → dừng khi cả 3 dưới 95%.

### 3.3. Thiết kế kỹ thuật đáng chú ý

- **Một nguồn sự thật:** Số liệu usage chỉ tính từ bảng `videos` và config limit; API và cleanup dùng chung hàm `get_video_storage_usage`.
- **An toàn khi xóa:** Chỉ xóa video đã upload (đã có bản trên S3) và không tranh chấp; xóa theo thứ tự cũ nhất trước.
- **Ngưỡng 95%:** Dùng chung hằng số `VIDEO_STORAGE_SAFE_THRESHOLD_PERCENT` cho cả “kích hoạt cleanup” và “dừng cleanup”.
- **DB path:** Chỉ tạo thư mục cho SQLite khi `os.path.dirname(db_path)` không rỗng, tránh lỗi trên một số môi trường.

---

## 4. Kết quả kiểm thử

*(Kiểm thử thực hiện thủ công; dự án chưa có bộ test tự động cho tính năng này.)*

### 4.1. Cấu hình và API

| Kịch bản | Cách test | Kết quả mong đợi |
|----------|-----------|-------------------|
| Đọc config | Chỉnh `config.json` (video_limits), gọi hàm đọc limit (hoặc script `video_limits.py`) | Đọc đúng storage_limit_gb, max_count, max_duration_min |
| API chưa đăng nhập | GET `/api/video_storage_usage` không gửi session | 401, message "Chưa đăng nhập" |
| API đã đăng nhập | GET `/api/video_storage_usage` với session hợp lệ | 200, JSON `{ success: true, usage: { used_gb, ... } }` |

### 4.2. Thu thập metadata và usage

| Kịch bản | Cách test | Kết quả mong đợi |
|----------|-----------|-------------------|
| Sau khi quay video | Quay một đoạn rồi dừng, kiểm tra DB `videos` hoặc gọi API usage | Có 1 bản ghi mới, used_gb / video_count / duration tăng tương ứng |
| Sau khi upload S3 | Upload xong 1 video, kiểm tra bản ghi trong `videos` | Cột is_uploaded = 1 cho video đó |

### 4.3. Giao diện Dashboard / Storage

| Kịch bản | Cách test | Kết quả mong đợi |
|----------|-----------|-------------------|
| Load Dashboard đã đăng nhập | Mở trang Dashboard | Card "Dung lượng video" hiển thị số GB, số video, phút; thanh % có màu (xanh/vàng/đỏ) theo % |
| Usage &lt; 70% | Config limit cao, ít video | Thanh xanh, không cảnh báo hoặc cảnh báo nhẹ |
| Usage 70–90% | Tăng dữ liệu hoặc giảm limit | Thanh vàng, có cảnh báo sớm |
| Usage ≥ 90% | Giảm limit hoặc nhiều video | Thanh đỏ, cảnh báo nguy hiểm / auto cleanup |
| Trang Storage | Mở Storage, đợi vài giây | Block dung lượng video hiển thị giống Dashboard; sau ~10s số liệu tự cập nhật |

### 4.4. Auto cleanup và audit log

| Kịch bản | Cách test | Kết quả mong đợi |
|----------|-----------|-------------------|
| Dưới ngưỡng 95% | Usage &lt; 95% | Không xóa video; không có bản ghi mới trong `video_delete_log` do cleanup |
| Vượt 95% (có video đã upload) | Đặt limit thấp, có vài video đã upload | Cleanup chạy; file local bị xóa; bản ghi `videos` đánh dấu is_deleted; `video_delete_log` có bản ghi reason=auto_cleanup, deleted_by=system |
| Video chưa upload | Vượt 95% nhưng toàn video chưa upload | Không xóa (không ứng viên); hoặc chỉ xóa đến hết ứng viên đã upload rồi dừng |

### 4.5. Tóm tắt kết quả test

- **Cấu hình & API:** Đọc config đúng; API trả 401 khi chưa đăng nhập, trả usage khi đã đăng nhập.
- **Thu thập & usage:** Metadata được ghi sau quay và sau upload; số liệu usage phản ánh đúng.
- **UI:** Dashboard và Storage hiển thị đúng số liệu, màu thanh và cảnh báo theo ngưỡng 70/90/100%.
- **Cleanup & log:** Cleanup kích hoạt khi vượt 95%; chỉ xóa video đã upload, không tranh chấp; audit log ghi đầy đủ.

*(Nếu có bổ sung test tự động (pytest/unit test) sau này, nên cập nhật mục này với kết quả và coverage tương ứng.)*

---

## 6. File liên quan

| File | Vai trò |
|------|--------|
| `app.py` | VIDEO_METADATA_DB, get_video_storage_usage, enforce_video_storage_limit, hook cleanup, API `/api/video_storage_usage` |
| `services/video_metadata.py` | Bảng videos + video_delete_log, insert/mark_*/list, log_video_deletion |
| `config.json` | Key `video_limits` (storage_limit_gb, max_count, max_duration_min) |
| `templates/dashboard.html` | Card dung lượng video + script fetch API |
| `templates/storage.html` | Block dung lượng video + script fetch API + refresh 10s |
| `video_limits.py` | Script test config (không import app) |

---

## 7. Tóm tắt

- **11 hạng mục** đã hoàn thành (config → metadata → thu thập → usage → cleanup → hook → log → API → Dashboard UI → Storage UI → cleanup theo max_count/max_duration_min).
- **1 API** mới: GET `/api/video_storage_usage`.
- **2 bảng DB** mới: `videos`, `video_delete_log`.
- **2 trang** có UI dung lượng + cảnh báo: Dashboard, Storage.

---

*Báo cáo được lập theo kết quả triển khai tính năng giới hạn – giám sát – auto cleanup dung lượng video.*
