# EcoHub – Tổng hợp dự án

## 1. Bảng danh sách API đang xây và lỗi

| Module | Method | Endpoint | Mô tả | Trạng thái | Lỗi / Ghi chú |
|--------|--------|----------|--------|------------|----------------|
| **Auth** | POST | `/api/auth/register` | Đăng ký | ✅ | - |
| | POST | `/api/auth/login` | Đăng nhập | ✅ | - |
| | POST | `/api/auth/refresh-token` | Làm mới token | ✅ | - |
| | POST | `/api/auth/logout` | Đăng xuất | ✅ | - |
| | GET | `/api/auth/me` | Thông tin user hiện tại | ✅ | - |
| | PUT | `/api/auth/me` | Cập nhật profile | ✅ | - |
| | PUT | `/api/auth/change-password` | Đổi mật khẩu | ✅ | - |
| | POST | `/api/auth/assume-shop` | Chuyển ngữ cảnh shop | ✅ | - |
| **Users** | GET | `/api/users` | Danh sách users | ✅ | - |
| | GET | `/api/users/:id` | Chi tiết user | ✅ | - |
| | POST | `/api/users` | Tạo user | ✅ | - |
| | PUT | `/api/users/:id` | Cập nhật user | ✅ | - |
| | DELETE | `/api/users/:id` | Xóa user | ⚠️ | Khi user là chủ shop: gửi body `{ transferShopToUserId }` hoặc để backend tự chuyển sang Super Admin khác |
| | POST | `/api/users/:id/roles` | Gán vai trò | ✅ | - |
| | DELETE | `/api/users/:id/roles/:roleId` | Gỡ vai trò | ✅ | - |
| **Orders** | GET | `/api/orders` | Danh sách đơn hàng | ✅ | - |
| | GET | `/api/orders/:id` | Chi tiết đơn | ✅ | - |
| | GET | `/api/orders/tracking/:trackingCode` | Tra cứu theo mã vận đơn | ✅ | - |
| | GET | `/api/orders/stats` | Thống kê đơn hàng | ✅ | - |
| | POST | `/api/orders` | Tạo đơn hàng | ✅ | - |
| | PUT | `/api/orders/:id` | Cập nhật đơn | ✅ | - |
| | PUT | `/api/orders/:id/status` | Cập nhật trạng thái | ✅ | - |
| | DELETE | `/api/orders/:id` | Hủy đơn | ✅ | - |
| **Products** | GET | `/api/products` | Danh sách sản phẩm | ✅ | - |
| | GET | `/api/products/categories` | Danh sách danh mục | ✅ | - |
| | POST | `/api/products/categories` | Tạo danh mục | ✅ | - |
| | GET | `/api/products/:id` | Chi tiết sản phẩm | ✅ | - |
| | POST | `/api/products` | Tạo sản phẩm | ✅ | - |
| | PUT | `/api/products/:id` | Cập nhật sản phẩm | ✅ | - |
| | DELETE | `/api/products/:id` | Xóa sản phẩm | ✅ | - |
| | PUT | `/api/products/:id/stock` | Cập nhật tồn kho | ✅ | - |
| **Videos** | GET | `/api/videos` | Danh sách video | ✅ | - |
| | GET | `/api/videos/:id` | Chi tiết video | ✅ | - |
| | GET | `/api/videos/tracking/:trackingCode` | Video theo mã vận đơn | ✅ | - |
| | GET | `/api/videos/order/:orderId` | Video theo đơn hàng | ✅ | - |
| | POST | `/api/videos/upload` | Upload video đóng gói | ✅ | - |
| | PUT | `/api/videos/:id/approve` | Phê duyệt video | ✅ | - |
| | DELETE | `/api/videos/:id` | Xóa video | ✅ | - |
| | POST | `/api/videos/receiving/upload` | Upload video nhận hàng | ✅ | - |
| | GET | `/api/videos/:id/compare` | So sánh video | ✅ | - |
| **Shipping** | GET | `/api/shipping/carriers` | Danh sách hãng vận chuyển | ✅ | - |
| | GET | `/api/shipping/carriers/:id` | Chi tiết hãng | ✅ | - |
| | POST | `/api/shipping/calculate-fee` | Tính phí vận chuyển | ✅ | - |
| | GET | `/api/shipping/track/:trackingCode` | Theo dõi vận đơn | ✅ | - |
| | GET | `/api/shipping/settings/:shopId` | Cài đặt vận chuyển shop | ✅ | - |
| | POST | `/api/shipping/settings` | Lưu cài đặt vận chuyển | ✅ | - |
| **Channels** | GET | `/api/channels` | Danh sách kênh | ✅ | - |
| | GET | `/api/channels/:id` | Chi tiết kênh | ✅ | - |
| | GET | `/api/channels/shop/:shopId/connections` | Kết nối shop–kênh | ✅ | - |
| | POST | `/api/channels/:id/connect` | Kết nối kênh | ✅ | - |
| | DELETE | `/api/channels/:id/disconnect` | Ngắt kết nối | ✅ | - |
| | POST | `/api/channels/:id/sync-orders` | Đồng bộ đơn hàng | ✅ | - |
| | POST | `/api/channels/:id/sync-products` | Đồng bộ sản phẩm | ✅ | - |
| **Reports** | GET | `/api/reports/dashboard` | Dashboard tổng quan | ✅ | - |
| | GET | `/api/reports/orders` | Báo cáo đơn hàng | ✅ | - |
| | GET | `/api/reports/videos` | Báo cáo video | ✅ | - |
| | GET | `/api/reports/revenue` | Báo cáo doanh thu | ✅ | - |
| | GET | `/api/reports/staff-performance` | Hiệu suất nhân viên | ✅ | - |
| | GET | `/api/reports/operational` | Báo cáo vận hành | ✅ | - |
| | POST | `/api/reports/sync-now` | Đồng bộ ngay | ✅ | - |
| | GET | `/api/reports/export` | Xuất báo cáo | ✅ | - |
| **Returns** | GET | `/api/returns` | Danh sách yêu cầu hoàn trả | ✅ | - |
| | GET | `/api/returns/:id` | Chi tiết hoàn trả | ✅ | - |
| | POST | `/api/returns` | Tạo yêu cầu hoàn trả | ✅ | - |
| | PUT | `/api/returns/:id/approve` | Duyệt hoàn trả | ✅ | - |
| | PUT | `/api/returns/:id/reject` | Từ chối hoàn trả | ✅ | - |
| | PUT | `/api/returns/:id/complete` | Hoàn tất hoàn trả | ✅ | - |
| **Meta** | GET | `/api/meta/roles` | Danh sách vai trò | ✅ | - |
| | GET | `/api/meta/shops` | Danh sách shop | ✅ | - |
| **Settings** | GET | `/api/settings/report-subscriptions` | Đăng ký nhận báo cáo | ✅ | Route dùng `settings.manage`; Super Admin có toàn quyền nên vẫn gọi được |
| | POST | `/api/settings/report-subscriptions` | Tạo đăng ký | ✅ | - |
| | PUT | `/api/settings/report-subscriptions/:id` | Cập nhật đăng ký | ✅ | - |
| | DELETE | `/api/settings/report-subscriptions/:id` | Xóa đăng ký | ✅ | - |
| **Shops** | GET | `/api/shops` | Danh sách shop | ✅ | - |
| | POST | `/api/shops` | Tạo shop (Super Admin) | ✅ | - |
| | DELETE | `/api/shops/:id` | Xóa/vô hiệu hóa shop | ✅ | - |

---

## 2. Bảng phân quyền hiện tại

**Vai trò trong hệ thống (5 role):** `super_admin`, `admin`, `staff`, `customer_service` (Chăm sóc khách hàng), `customer`.

| Permission | Super Admin | Admin | Staff | Customer Service | Khách hàng |
|------------|:-----------:|:-----:|:-----:|:----------------:|:----------:|
| **Users** | | | | | |
| users.view | ✅ | ✅ | ❌ | ❌ | ❌ |
| users.create | ✅ | ✅ (trong shop) | ❌ | ❌ | ❌ |
| users.update | ✅ | ✅ (trong shop) | ❌ | ❌ | ❌ |
| users.delete | ✅ (chỉ Super Admin) | ❌ | ❌ | ❌ | ❌ |
| **Orders** | | | | | |
| orders.view | ✅ | ✅ | ✅ | ✅ | ✅ (chỉ đơn của mình) |
| orders.create | ✅ | ✅ | ❌ | ❌ | ❌ |
| orders.update | ✅ | ✅ | ❌ | ❌ | ❌ |
| orders.status | ✅ | ✅ | ✅ | ✅ | ❌ |
| orders.delete | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Products** | | | | | |
| products.view | ✅ | ✅ | ✅ | ✅ | ❌ |
| products.create | ✅ | ✅ | ✅ | ❌ | ❌ |
| products.update | ✅ | ✅ | ✅ | ❌ | ❌ |
| products.delete | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Videos** | | | | | |
| videos.view | ✅ | ✅ | ✅ | ✅ | ✅ |
| videos.upload | ✅ | ✅ | ✅ | ❌ | ❌ |
| videos.approve | ✅ | ✅ | ❌ | ❌ | ❌ |
| videos.delete | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Reports** | | | | | |
| reports.view | ✅ | ✅ | ❌ | ❌ | ❌ |
| reports.export | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Settings** | | | | | |
| settings.view | ✅ | ✅ | ❌ | ❌ | ❌ |
| settings.update | ✅ | ❌ | ❌ | ❌ | ❌ |
| settings.manage | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Shipping** | | | | | |
| shipping.view | ✅ | ✅ | ❌ | ✅ | ❌ |
| shipping.manage | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Returns** | | | | | |
| returns.view | ✅ | ✅ | ❌ | ✅ | ✅ |
| returns.process | ✅ | ✅ | ❌ | ✅ | ❌ |

**Route đặc biệt theo role:**
- **Xóa user:** chỉ `super_admin`.
- **Gán/Gỡ role:** `super_admin` hoặc `admin`.
- **Tạo/Cập nhật/Xóa sản phẩm, danh mục:** `admin` hoặc `super_admin`.
- **Tạo shop, Xóa shop:** chỉ `super_admin`.
- **Trong shop:** được tạo user với role `staff` hoặc `customer_service`.

---

## 3. Bảng test case (gợi ý)

| ID | Module | Tên test case | Mô tả | Loại | Ưu tiên |
|----|--------|----------------|-------|------|---------|
| TC-AUTH-01 | Auth | Đăng ký thành công | Body hợp lệ → 201, user + token | Happy path | Cao |
| TC-AUTH-02 | Auth | Đăng ký email trùng | Email đã tồn tại → 409 | Negative | Cao |
| TC-AUTH-03 | Auth | Đăng nhập đúng | Email + password đúng → 200, token | Happy path | Cao |
| TC-AUTH-04 | Auth | Đăng nhập sai mật khẩu | Password sai → 401 | Negative | Cao |
| TC-AUTH-05 | Auth | Refresh token hợp lệ | refreshToken còn hạn → 200, accessToken mới | Happy path | Trung bình |
| TC-AUTH-06 | Auth | Me với token hợp lệ | Bearer token hợp lệ → 200, thông tin user | Happy path | Cao |
| TC-AUTH-07 | Auth | Me không token | Không Authorization → 401 | Negative | Cao |
| TC-USER-01 | Users | Danh sách users (Super Admin) | GET /users → 200, có data | Happy path | Cao |
| TC-USER-02 | Users | Danh sách users (Staff) | GET /users với token Staff → 403 | Negative | Cao |
| TC-USER-03 | Users | Xóa user không có shop | User không sở hữu shop → DELETE 204 | Happy path | Cao |
| TC-USER-04 | Users | Xóa user là chủ shop, có Super Admin khác | Tự chuyển shop → 204 | Happy path | Cao |
| TC-USER-05 | Users | Xóa user là chủ shop + transferShopToUserId | Body transferShopToUserId → 204 | Happy path | Trung bình |
| TC-USER-06 | Users | Tạo user role customer_service trong shop | POST /users với roleId Customer Service → 201 | Happy path | Trung bình |
| TC-ORDER-01 | Orders | Tạo đơn hàng hợp lệ | POST /orders body đủ → 201 | Happy path | Cao |
| TC-ORDER-02 | Orders | Cập nhật trạng thái đơn | PUT /orders/:id/status → 200 | Happy path | Cao |
| TC-PROD-01 | Products | CRUD sản phẩm (Admin) | Tạo/Sửa/Xóa sản phẩm với Admin → 200/201/204 | Happy path | Cao |
| TC-VIDEO-01 | Videos | Upload video đóng gói | POST /videos/upload multipart → 201 | Happy path | Cao |
| TC-VIDEO-02 | Videos | Phê duyệt video | PUT /videos/:id/approve → 200 | Happy path | Trung bình |
| TC-VIDEO-03 | Videos | Customer Service xem tất cả video shop | GET /videos với token customer_service + shopId → 200, video của shop | Happy path | Trung bình |
| TC-REPORT-01 | Reports | Dashboard theo shop/ngày | GET /reports/dashboard với query → 200 | Happy path | Trung bình |
| TC-RETURN-01 | Returns | Tạo yêu cầu hoàn trả | POST /returns body hợp lệ → 201 | Happy path | Trung bình |
| TC-SHOP-01 | Shops | Tạo shop (Super Admin) | POST /shops → 201 | Happy path | Cao |
| TC-SHOP-02 | Shops | Danh sách shop (Admin) | GET /shops với token Admin → 200 | Happy path | Trung bình |

---

## 4. Bảng module tính năng – Đang xây / Đã xong / Sắp xây

| Module | Tính năng | Backend | Frontend | Trạng thái | Ghi chú |
|--------|-----------|:-------:|:--------:|------------|--------|
| **Auth** | Đăng ký / Đăng nhập | ✅ | ✅ | Đã xong | Login, Register page |
| | Refresh token | ✅ | ✅ (axios interceptor) | Đã xong | - |
| | Profile / Đổi mật khẩu | ✅ | ✅ (ProfilePage) | Đã xong | - |
| | Chuyển ngữ cảnh shop (assume-shop) | ✅ | ✅ | Đã xong | - |
| **Users** | Danh sách / Lọc / Phân trang | ✅ | ✅ | Đã xong | UsersPage |
| | Tạo / Sửa / Xóa user | ✅ | ✅ | Đã xong | Xóa: modal chuyển shop khi lỗi |
| | Gán / Gỡ vai trò | ✅ | ⚠️ | Đang xây | API có, UI có thể bổ sung |
| **Shops** | Danh sách shop | ✅ | ✅ | Đã xong | ShopsPage |
| | Tạo shop (Super Admin) | ✅ | ✅ | Đã xong | - |
| | Xóa/vô hiệu hóa shop | ✅ | ✅ | Đã xong | - |
| **Orders** | Danh sách / Chi tiết đơn | ✅ | ✅ | Đã xong | OrdersPage, OrderDetailPage |
| | Tạo / Cập nhật / Hủy đơn | ✅ | ✅ | Đã xong | - |
| | Cập nhật trạng thái | ✅ | ✅ | Đã xong | - |
| | Tra cứu mã vận đơn | ✅ | ✅ | Đã xong | TrackingPage |
| **Products** | Danh sách / CRUD sản phẩm | ✅ | ✅ | Đã xong | ProductsPage |
| | Tồn kho / Danh mục | ✅ | ✅ | Đã xong | InventoryPage, categories |
| **Videos** | Danh sách video / Theo đơn, mã vận đơn | ✅ | ✅ | Đã xong | VideosPage |
| | Upload video đóng gói | ✅ | ✅ | Đã xong | CreateVideoPage |
| | Upload video nhận hàng | ✅ | ✅ | Đã xong | ReceivingVideosPage |
| | Phê duyệt / Xóa / So sánh video | ✅ | ⚠️ | Đang xây | API đủ, UI có thể bổ sung |
| **Shipping** | Danh sách hãng / Tính phí / Theo dõi | ✅ | ✅ | Đã xong | Dùng trong Orders/Tracking |
| | Cài đặt vận chuyển theo shop | ✅ | ⚠️ | Đang xây | API có, trang cài đặt riêng có thể chưa đủ |
| **Channels** | Kết nối kênh / Đồng bộ đơn, sản phẩm | ✅ | ⚠️ | Đang xây | API có, UI tích hợp Settings/Shop |
| **Reports** | Dashboard / Báo cáo đơn, video, doanh thu | ✅ | ✅ | Đã xong | ReportsPage |
| | Xuất báo cáo / Hiệu suất nhân viên | ✅ | ⚠️ | Đang xây | API có, UI có thể bổ sung |
| **Returns** | Danh sách / Tạo / Duyệt / Từ chối hoàn trả | ✅ | ⚠️ | Đang xây | API đủ, trang Returns có thể chưa đầy đủ |
| **Settings** | Đăng ký nhận báo cáo (email) | ✅ | ✅ | Đã xong | SettingsPage |
| **Meta** | Roles / Shops (dropdown, filter) | ✅ | ✅ | Đã xong | Dùng trong Users, Shops, Orders |
| **Dashboard** | Tổng quan số liệu | ✅ | ✅ | Đã xong | DashboardPage |
| **Role Customer Service** | Role Chăm sóc khách hàng (customer_service) | ✅ | ✅ | Đã xong | Schema, migration, seed, backend, frontend (badge, menu, tạo user) |
| **Notification** | Thông báo realtime / in-app | ❌ | ❌ | Sắp xây | Model có, chưa có service/push |
| **Audit log** | Lịch sử thao tác theo user/entity | ❌ | ❌ | Sắp xây | - |

---

## 5. Bảng tương tác trong hệ thống

| Từ (Actor/Module) | Tương tác | Đến (Module/Entity) | Mô tả |
|-------------------|------------|---------------------|--------|
| User (khách) | Đăng ký / Đăng nhập | Auth | Tạo phiên, nhận JWT |
| User | Gọi API có Bearer token | Auth middleware | Xác thực, gán req.user (userId, roles, shopId) |
| Auth middleware | Kiểm tra permission | RolePermission (DB) | authorizePermission('x.y') |
| Super Admin | Tạo shop | Shops | Tạo shop, gán owner = user |
| Super Admin / Admin | Tạo user / Gán role | Users, UserRole | Admin / Staff / Customer Service gắn với shop |
| Admin / Staff / Customer Service | Chọn "Làm việc tại shop X" | Auth (assume-shop) | Đặt shopId vào token/context |
| Admin / Staff / Customer Service | Xem đơn, sản phẩm, video (theo shop) | Orders, Products, Videos | Lọc theo shopId trong token |
| Staff | Upload video đóng gói | Videos, Order, PackageVideo | Gắn video với order, trackingCode |
| Staff / Khách | Upload video nhận hàng | Videos, ReceivingVideo | Gắn với order, customerId |
| Admin / Super Admin | Phê duyệt video | PackageVideo | approvedBy, approvedAt |
| Customer Service | Xem tất cả video trong shop | Videos | Logic giống Admin (isAdminLike), không filter recordedBy |
| Order | Tạo / Cập nhật trạng thái | OrderStatusHistory | changedBy = user |
| Order | Tạo đơn | Product, OrderItem | Tham chiếu sản phẩm, đơn vị |
| Shipping | Tính phí / Theo dõi | ShippingCarrier, ShopCarrierSetting | Theo shop, carrier |
| Channel | Kết nối / Đồng bộ đơn | ShopChannelConnection, Order | Kéo đơn từ kênh vào Orders |
| Report | Dashboard / Báo cáo | Order, Video, Product, User | Tổng hợp theo shop, ngày |
| Settings | Đăng ký nhận báo cáo | ReportSubscription, Email | Gửi email báo cáo theo lịch |
| User (khách) | Tạo yêu cầu hoàn trả | ReturnRequest | customerId, orderId |
| Admin / Customer Service | Duyệt / Từ chối / Hoàn tất hoàn trả | ReturnRequest | reviewedBy, status |
| Super Admin | Xóa user | Users, Shops, Orders, Videos, … | Transaction: chuyển shop (nếu có), null FK, xóa phụ thuộc, xóa user |
| Frontend | Gọi API | Backend (Express) | Axios, baseURL /api, interceptors refresh token |
| Backend | Ghi DB | PostgreSQL (Prisma) | Migrations, schema.prisma |
| Backend | Cache / queue (nếu dùng) | Redis | Cấu hình REDIS_URL |

---

## Chạy lại migration và seed

Khi đã có database (ví dụ Docker: `docker compose up -d` postgres) và file `.env` với `DATABASE_URL`:

```bash
cd backend
npx prisma migrate deploy    # Áp dụng migration (thêm role customer_service)
npx prisma generate          # Sinh lại Prisma Client
npx prisma db seed           # Seed roles, permissions, dữ liệu mẫu
```

Nếu dùng `migrate dev` (môi trường dev): `npx prisma migrate dev` rồi `npx prisma db seed`.

---

*Tài liệu tổng hợp từ codebase; cập nhật theo trạng thái dự án (đã thêm role Customer Service).*
