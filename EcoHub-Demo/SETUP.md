# Hướng dẫn Setup và Chạy Dự án

## Bước 1: Khởi động Docker Desktop

Đảm bảo Docker Desktop đang chạy trên máy của bạn.

## Bước 2: Khởi động các services

```powershell
docker compose up -d
```

## Bước 3: Chạy Migration Database

Sau khi Docker đã khởi động, chạy migration để tạo bảng `report_subscriptions`:

```powershell
docker compose exec backend npx prisma migrate deploy
```

Hoặc sử dụng script:
```powershell
.\run-migration.ps1
```

## Bước 4: Cấu hình Email (Tùy chọn)

Nếu muốn sử dụng tính năng gửi email báo cáo tự động, thêm các biến môi trường sau vào file `.env` trong thư mục `backend`:

```env
MAIL_MAILER=smtp
MAIL_HOST=e2.vinahost.vn
MAIL_PORT=465
MAIL_USERNAME="dev@ecotel.com.vn"
MAIL_PASSWORD=EcotelEmail
MAIL_ENCRYPTION=null
MAIL_FROM_ADDRESS="dev@ecotel.com.vn"
MAIL_FROM_NAME="ecotel"
MAIL_REPLY_ADDRESS="dev@ecotel.com.vn"
MAIL_REPLY_NAME="ecotel"
```

Sau đó restart backend:
```powershell
docker compose restart backend
```

## Bước 5: Truy cập ứng dụng

- Frontend: http://localhost:5173
- Backend API: http://localhost:3000
- API Docs: http://localhost:3000/api/docs

## Tính năng mới đã thêm

✅ **Email Báo cáo tự động**: Gửi báo cáo hàng ngày lúc 18:00
✅ **Quản lý Email Subscriptions**: Cấu hình email nhận báo cáo trong Settings
✅ **Dashboard với cảnh báo**: Hiển thị dung lượng video và cảnh báo khi gần đầy
✅ **Báo cáo tách biệt**: Tài chính và Vận hành
✅ **Demo Sync Shopee/TikTok**: Đồng bộ đơn hàng từ các sàn thương mại điện tử
✅ **Video hoàn hàng**: Trang quản lý video hoàn hàng cho CSKH

## Troubleshooting

### Docker không chạy được
- Đảm bảo Docker Desktop đã được cài đặt và đang chạy
- Kiểm tra Docker daemon: `docker ps`

### Migration lỗi
- Đảm bảo PostgreSQL container đã khởi động: `docker compose ps`
- Kiểm tra logs: `docker compose logs postgres`

### Email không gửi được
- Kiểm tra cấu hình SMTP trong `.env`
- Xem logs backend: `docker compose logs backend`
