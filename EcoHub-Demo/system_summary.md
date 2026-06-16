# Báo Cáo Tổng Hợp Hệ Thống EcoHub

Tài liệu này tổng hợp chi tiết về **dung lượng lưu trữ video**, **yêu cầu cấu hình thiết bị/phần cứng**, và **sơ bộ các hạng mục tính năng đã hoàn thiện** trên hệ thống EcoHub.

---

## 1. Phân Tích Dung Lượng Video & Dự Phóng Bộ Nhớ

### 1.1. Thông Số Giả Định Vận Hành Tiêu Chuẩn

| Thông số vận hành | Định mức tiêu chuẩn | Ý nghĩa / Ghi chú |
| :--- | :--- | :--- |
| **Ca làm việc tiêu chuẩn** | **8 tiếng** (480 phút) | Thời gian hoạt động thực tế của một ca kho. |
| **Tần suất đóng gói** | **60 giây / đơn hàng** | Định mức hoàn thành trung bình cho một đơn hàng. |
| **Số lượng video / ca** | **480 video** | Số lượng đơn hàng cần ghi hình trong mỗi ca làm việc. |
| **Video Gốc Thô (MPEG-4)** | **18.00 MB – 25.00 MB** | Video thô chưa tối ưu (định dạng `mp4v` ghi gốc từ camera). |
| **Video Nén Trước Đây (H.264 - CRF 30)** | **8.75 MB – 9.00 MB** | Thực tế đo được khi đóng gói các đơn hàng cụ thể của khách. |
| **Video Nén Tối Ưu Mới (H.264 - CRF 33, Medium)** | **5.00 MB – 6.00 MB** | Dự kiến sau khi tối ưu giảm chất lượng dư thừa (tiết kiệm thêm ~35%). |

### 1.2. Bảng Dự Phóng Lưu Trữ Theo Thời Gian

Dưới đây là so sánh bộ nhớ lưu trữ theo các định mức chất lượng (giả định 1 ca = 480 video; 3 ca = 1,440 video/ngày):

| Chu kỳ thời gian | Số ca / ngày | Tổng số đơn | Video Nén Cũ (8.75 - 9MB) | Video Nén Tối Ưu Mới (5 - 6MB) | Tiết kiệm bộ nhớ |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **1 ca (8 tiếng)** | 1 ca | 480 | **4.10 GB – 4.22 GB** | **2.34 GB - 2.81 GB** | ~35% |
| **1 ngày (24 tiếng)** | 3 ca | 1,440 | **12.30 GB – 12.66 GB** | **7.03 GB - 8.44 GB** | ~35% |
| **1 tuần (7 ngày)** | 1 ca/ngày | 3,360 | **28.71 GB – 29.53 GB** | **16.41 GB - 19.69 GB** | ~35% |
| | 3 ca/ngày | 10,080 | **86.13 GB – 88.59 GB** | **49.22 GB - 59.06 GB** | ~35% |
| **1 tháng (30 ngày)** | 1 ca/ngày | 14,400 | **123.05 GB – 126.56 GB** | **70.31 GB - 84.38 GB** | ~35% |
| | 3 ca/ngày | 43,200 | **369.14 GB – 379.69 GB** | **210.94 GB - 253.13 GB** | ~35% |
| **1 năm (365 ngày)** | 1 ca/ngày | 175,200 | **1.50 TB – 1.54 TB** | **855.47 GB - 1.00 TB** | ~35% |
| | 3 ca/ngày | 525,600 | **4.49 TB – 4.61 TB** | **2.51 TB - 3.01 TB** | ~35% |

> [!IMPORTANT]
> **Chính Sách Dọn Dẹp Bộ Nhớ (Retention Policy) - ĐÃ PHÊ DUYỆT**:
> Hệ thống chạy tác vụ tự động (Cron job) **dọn dẹp và xóa vĩnh viễn các video đóng gói cũ sau 30 ngày kể từ ngày tạo**.
> - **Khi chạy 1 ca/ngày (480 đơn/ngày)**: Tổng dung lượng video tích lũy trong 30 ngày khoảng **70.31 GB – 84.38 GB**, nằm hoàn toàn trong giới hạn an toàn của gói **100 GB S3** được thuê.
> - **Khi chạy tối đa 3 ca/ngày (1,440 đơn/ngày)**: Tổng dung lượng video tích lũy trong 30 ngày sẽ tăng lên khoảng **210.94 GB – 253.13 GB**. Để lưu trữ đủ 30 ngày ở quy mô 3 ca, bạn sẽ cần nâng cấp gói S3 lên tối thiểu **250 GB** hoặc **300 GB**.

---

## 2. Tài Nguyên Thiết Bị & Cấu Hình Triển Khai Thực Tế

### 2.1 Cấu Hình Máy Chủ Hệ Thống (Server Cloud Được Chọn)

| Hạng mục thành phần | Thông số cấu hình chi tiết | Vai trò / Ghi chú |
| :--- | :--- | :--- |
| **Gói Elastic Compute** | **4 vCPU, 8 GB RAM** | Chạy API Backend (Express), Web Frontend (React), DB PostgreSQL, cache Redis. |
| **Hệ điều hành (OS)** | Ubuntu 22.04 LTS hoặc Windows Server 2022 | Nền tảng hệ điều hành máy chủ. |
| **Ổ cứng cài App & DB** | **100 GB SSD (EV SSD)** | Lưu trữ hệ điều hành, mã nguồn ứng dụng và cơ sở dữ liệu. |
| **Bộ lưu trữ video** | **100 GB S3 Object Storage** | Lưu trữ video đóng gói trong vòng 30 ngày (Wasabi, AWS S3 hoặc MinIO). |

### 2.2 Cấu Hình Thiết Bị Tại Quầy Đóng Hàng (Client)

| Thiết bị / Phần mềm | Yêu cầu thông số tối thiểu | Hướng dẫn vận hành |
| :--- | :--- | :--- |
| **Máy tính (PC/Laptop)** | Có kết nối mạng, cài đặt Python 3.10+ | Chạy client ứng dụng quay video & quét mã AI tại quầy. |
| **Camera ghi hình** | USB Webcam (720p/1080p) hoặc Camera IP RTSP | Lắp phía trên quầy đóng gói hướng thẳng xuống mặt bàn. |
| **Thư viện phần mềm** | OpenCV (`opencv-contrib-python`) | Bắt buộc cài bản `contrib` để dùng codec MP4/H264 nhẹ và ổn định. |
| **Thiết bị quét mã** | Camera AI quét trực tiếp hoặc Máy quét cầm tay | Dùng để quét mã vận đơn giúp tự động kích hoạt quay video. |

---

## 3. Sơ Bộ Các Hạng Mục Web EcoHub Đã Có (Trạng Thái Triển Khai)

Dưới đây là các module chức năng chính đã được phát triển trên Web quản trị EcoHub:

### 3.1 Nhóm Vận Hành & Quản Lý Đơn Hàng
*   **Quản lý đơn hàng (Orders)**: Hỗ trợ tạo đơn, xem danh sách đơn hàng (lọc theo shop, trạng thái), lịch sử cập nhật trạng thái đơn (`OrderStatusHistory`), và giao diện tra cứu hành trình vận đơn công khai.
*   **Quản lý sản phẩm (Products)**: Thêm/Sửa/Xóa sản phẩm, phân mục danh mục sản phẩm, và cập nhật số lượng tồn kho tự động trong phạm vi cửa hàng.
*   **Kênh bán hàng (Channels)**: Kết nối và đồng bộ đơn hàng/sản phẩm từ các sàn thương mại điện tử (Shopee, Lazada, TikTok Shop) về hệ thống quản lý tập trung.

### 3.2 Nhóm Quản Lý Video & Đối Soát Khiếu Nại
*   **Ghi và Tải video (Videos)**: 
    - Nhân viên kho upload video quá trình đóng gói (`PackageVideo`) gắn với mã đơn hàng.
    - Khách hàng/nhân viên tải video nhận hàng (`ReceivingVideo`) phục vụ đối chứng.
*   **So sánh video (Compare)**: Hỗ trợ xem song song và so sánh video đóng gói đầu gửi và video mở hàng đầu nhận để phát hiện các trường hợp tráo hàng, thiếu hàng.
*   **Quản lý hoàn trả (Returns)**: Tiếp nhận yêu cầu hoàn trả từ khách hàng kèm video nhận hàng làm bằng chứng, bộ phận CSKH thực hiện Duyệt / Từ chối / Hoàn tất hoàn trả trực tiếp.

### 3.3 Nhóm Quản Trị Hệ Thống & Báo Cáo
*   **Đăng nhập & Impersonate (Auth)**: Cơ chế phân quyền chặt chẽ theo vai trò (Super Admin, Admin, Staff, CSKH, Customer). Tính năng **Assume Shop** giúp Super Admin chuyển đổi ngữ cảnh để quản trị bất kỳ shop nào.
*   **Báo cáo & Dashboard**: 
    - Giao diện Dashboard hiển thị trực quan biểu đồ doanh thu, số lượng đơn hàng, video đóng gói trong ngày.
    - Báo cáo chi tiết về hiệu suất làm việc của nhân viên kho, báo cáo vận chuyển và doanh thu tài chính.
*   **Cấu hình nhận báo cáo (Settings)**: Hệ thống tự động gửi email báo cáo tổng hợp (tài chính, vận hành hoặc cả hai) định kỳ vào **18:00 hằng ngày** cho danh sách các email đã đăng ký theo từng shop.
