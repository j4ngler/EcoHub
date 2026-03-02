## Cấu trúc dự án EcoHub

Repo này chứa **2 phần chính**:

- **`EcoHub-Demo/`**: mã nguồn **web app EcoHub** (backend Node.js + frontend React, nginx, scripts, docker-compose, tài liệu hệ thống, v.v.).
- **`eco_hub_demo/`**: mã nguồn **ứng dụng quay video/scan QR** (Flask + OpenCV) dùng để tích hợp với EcoHub, phục vụ các luồng như đóng gói, quét mã, ghi video (có thể được đóng gói để chạy trên thiết bị riêng như PC/thiết bị hỗ trợ cho app điện thoại).

Khi làm việc:

- Nếu chỉnh sửa **web admin / API / dashboard** → làm việc trong thư mục `EcoHub-Demo/`.
- Nếu chỉnh sửa **ứng dụng quay video + quét QR** → làm việc trong thư mục `eco_hub_demo/`.

