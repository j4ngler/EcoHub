# EcoHub – Tổng quan hệ thống & tài liệu dự án

Tài liệu này tóm tắt **kiến trúc, API chính, phân quyền vai trò, luồng nghiệp vụ và roadmap tính năng** cho toàn bộ hệ thống EcoHub (backend + frontend).

---

## 1. Kiến trúc tổng quan

- **Backend**
  - Node.js + Express + TypeScript
  - Prisma ORM + PostgreSQL
  - Redis (dự phòng cho cache / queue)
  - Nền tảng RBAC: `User` – `Role` – `Permission` – `UserRole` – `RolePermission`
  - Module hóa theo nghiệp vụ: `auth`, `users`, `shops`, `orders`, `products`, `videos`, `shipping`, `channels`, `reports`, `returns`, `settings`, `meta`
  - Cron job gửi **email báo cáo hằng ngày** (18:00 VN time)

- **Frontend**
  - React + TypeScript + Vite
  - Zustand (`authStore`) quản lý user + token + `activeShop`
  - React Query quản lý state gọi API
  - TailwindCSS + bộ component `ui/*` (Button, Card, Modal, Input, Select, Badge, …)
  - Routing theo module: `auth`, `dashboard`, `users`, `shops`, `orders`, `products`, `videos`, `reports`, `returns`, `settings`, `tracking`

- **Triển khai**
  - Docker Compose: `backend`, `frontend`, `postgres`, `redis`, `nginx`
  - Nginx reverse proxy / cache tĩnh / bảo mật cơ bản

---

## 2. Vai trò & phân quyền

**Role hệ thống:**

- `super_admin`
- `admin`
- `staff` (nhân viên đóng hàng)
- `customer_service` (nhân viên chăm sóc khách hàng)
- `customer` (khách hàng)

### 2.1. Mục tiêu từng role

- **Super Admin**
  - Toàn quyền hệ thống: user, shop, cấu hình, báo cáo, xóa dữ liệu
  - Tạo / xóa / quản lý shop
  - Có thể “vào” shop bất kỳ ở chế độ impersonate (assume-shop)

- **Admin (theo shop)**
  - Quản trị một shop: user, sản phẩm, đơn hàng, vận chuyển trong shop
  - Xem & thao tác báo cáo ở phạm vi shop

- **Staff (Nhân viên đóng hàng)**
  - Làm việc trong shop: đóng gói, tạo & cập nhật đơn, upload video đóng gói
  - Quản lý sản phẩm trong shop (tạo/cập nhật)

- **Customer Service (CSKH)**
  - Làm việc trong shop: xem đơn, cập nhật trạng thái, xử lý hoàn trả, xem vận chuyển
  - Xem video đóng gói / nhận hàng để hỗ trợ khách

- **Customer (Khách hàng)**
  - Đăng ký / đăng nhập
  - Xem đơn của chính mình, xem video đóng gói
  - Tạo yêu cầu hoàn trả, upload video nhận hàng

### 2.2. Ma trận quyền (rút gọn)

| Permission            | Super Admin | Admin                     | Staff                                   | CSKH                                     | Customer                          |
|-----------------------|:-----------:|:-------------------------:|:---------------------------------------:|:----------------------------------------:|:----------------------------------:|
| **Users**             |             |                           |                                         |                                          |                                    |
| `users.view`          | ✅          | ✅                         | ❌                                       | ❌                                        | ❌                                  |
| `users.create`        | ✅          | ✅ (trong shop)           | ❌                                       | ❌                                        | ❌                                  |
| `users.update`        | ✅          | ✅ (trong shop)           | ❌                                       | ❌                                        | ❌                                  |
| `users.delete`        | ✅ (only SA)| ❌                         | ❌                                       | ❌                                        | ❌                                  |
| **Orders**            |             |                           |                                         |                                          |                                    |
| `orders.view`         | ✅          | ✅                         | ✅                                       | ✅                                        | ✅ (đơn của mình)                  |
| `orders.status`       | ✅          | ✅                         | ✅                                       | ✅                                        | ❌                                  |
| **Products**          |             |                           |                                         |                                          |                                    |
| `products.view`       | ✅          | ✅                         | ✅                                       | ✅                                        | ❌                                  |
| `products.create`     | ✅          | ✅                         | ✅                                       | ❌                                        | ❌                                  |
| `products.update`     | ✅          | ✅                         | ✅                                       | ❌                                        | ❌                                  |
| **Videos**            |             |                           |                                         |                                          |                                    |
| `videos.view`         | ✅          | ✅                         | ✅                                       | ✅                                        | ✅                                  |
| `videos.upload`       | ✅          | ✅                         | ✅                                       | ❌                                        | ❌                                  |
| `videos.approve`      | ✅          | ✅                         | ❌                                       | ❌                                        | ❌                                  |
| **Reports**           |             |                           |                                         |                                          |                                    |
| `reports.view`        | ✅          | ✅                         | ❌                                       | ❌                                        | ❌                                  |
| `reports.export`      | ✅          | ✅                         | ❌                                       | ❌                                        | ❌                                  |
| **Settings**          |             |                           |                                         |                                          |                                    |
| `settings.view`       | ✅          | ✅                         | ❌                                       | ❌                                        | ❌                                  |
| `settings.update`     | ✅          | ❌                         | ❌                                       | ❌                                        | ❌                                  |
| `settings.manage`     | ✅          | ❌                         | ❌                                       | ❌                                        | ❌                                  |
| **Shipping**          |             |                           |                                         |                                          |                                    |
| `shipping.view`       | ✅          | ✅                         | ❌                                       | ✅                                        | ❌                                  |
| `shipping.manage`     | ✅          | ✅                         | ❌                                       | ❌                                        | ❌                                  |
| **Returns**           |             |                           |                                         |                                          |                                    |
| `returns.view`        | ✅          | ✅                         | ❌                                       | ✅                                        | ✅                                  |
| `returns.process`     | ✅          | ✅                         | ❌                                       | ✅                                        | ❌                                  |

**Lưu ý đặc biệt:**

- Xóa user / xóa shop: **chỉ Super Admin**
- Tạo user trong **ngữ cảnh shop**: chỉ cho phép role `staff`, `customer_service`, `customer`
- Super Admin có thể **assume shop** để thao tác như admin của shop đó, nhưng vẫn bị giới hạn bởi shop hiện tại.

---

## 3. API theo module (tóm tắt)

### 3.1 Auth

- `POST /api/auth/register` – Đăng ký
- `POST /api/auth/login` – Đăng nhập
- `POST /api/auth/refresh-token` – Làm mới access token
- `POST /api/auth/logout` – Đăng xuất
- `GET /api/auth/me` – Thông tin user hiện tại
- `PUT /api/auth/me` – Cập nhật profile
- `PUT /api/auth/change-password` – Đổi mật khẩu
- `POST /api/auth/assume-shop` – Chuyển ngữ cảnh shop (impersonate Admin shop)

### 3.2 Users

- `GET /api/users` – Danh sách user (Super Admin/Admin)
- `GET /api/users/:id` – Chi tiết user
- `POST /api/users` – Tạo user (Super Admin/Admin)
  - Trong shop context: bắt buộc chọn role `staff` / `customer_service` / `customer`
  - `shopId` auto lấy từ context nếu đang assume shop
- `PUT /api/users/:id` – Cập nhật thông tin
- `DELETE /api/users/:id` – Xóa user
  - Nếu user là chủ shop: dùng `transferShopToUserId` hoặc backend tự tìm Super Admin khác để chuyển shop
- `POST /api/users/:id/roles` – Gán vai trò (Super Admin/Admin)
- `DELETE /api/users/:id/roles/:roleId` – Gỡ vai trò

### 3.3 Shops

- `GET /api/shops` – Danh sách shop user có thể quản lý
- `POST /api/shops` – Tạo shop mới (Super Admin)
- `DELETE /api/shops/:id` – Xóa/vô hiệu hóa shop (Super Admin, có xác nhận mật khẩu)

### 3.4 Orders

- `GET /api/orders` – Danh sách đơn (filter theo shop, status, search)
- `GET /api/orders/:id` – Chi tiết đơn
- `GET /api/orders/tracking/:code` – Tra mã vận đơn (public)
- `POST /api/orders` – Tạo đơn
- `PUT /api/orders/:id` – Cập nhật đơn
- `PUT /api/orders/:id/status` – Cập nhật trạng thái
- `DELETE /api/orders/:id` – Hủy đơn

### 3.5 Products

- CRUD sản phẩm, danh mục, tồn kho:
  - `GET /api/products`
  - `GET /api/products/:id`
  - `POST /api/products`
  - `PUT /api/products/:id`
  - `DELETE /api/products/:id`
  - `PUT /api/products/:id/stock`
  - `GET/POST /api/products/categories`

### 3.6 Videos

- `GET /api/videos` – Danh sách video (filter theo shop, order, trackingCode,…)
- `GET /api/videos/:id` – Chi tiết video
- `GET /api/videos/tracking/:code` – Video theo mã vận đơn
- `POST /api/videos/upload` – Upload video đóng gói (Staff)
- `POST /api/videos/receiving/upload` – Upload video nhận hàng (Customer/Staff)
- `PUT /api/videos/:id/approve` – Phê duyệt video (Admin/Super Admin)
- `DELETE /api/videos/:id` – Xóa video
- `GET /api/videos/:id/compare` – So sánh video đóng gói vs nhận hàng

### 3.7 Shipping

- `GET /api/shipping/carriers` – Danh sách hãng vận chuyển
- `POST /api/shipping/calculate-fee` – Tính phí vận chuyển
- `GET /api/shipping/track/:trackingCode` – Theo dõi vận đơn
- `GET/POST /api/shipping/settings` – Cài đặt vận chuyển theo shop

### 3.8 Channels

- `GET /api/channels` – Danh sách kênh bán hàng
- `POST /api/channels/:id/connect` – Kết nối kênh
- `POST /api/channels/:id/sync-orders` – Đồng bộ đơn
- `POST /api/channels/:id/sync-products` – Đồng bộ sản phẩm

### 3.9 Reports

- `GET /api/reports/dashboard` – Dashboard tổng quan (theo shop/ngày)
- `GET /api/reports/orders` – Báo cáo đơn hàng
- `GET /api/reports/videos` – Báo cáo video
- `GET /api/reports/revenue` – Báo cáo doanh thu
- `GET /api/reports/staff-performance` – Hiệu suất nhân viên
- `GET /api/reports/operational` – Báo cáo vận hành
- `POST /api/reports/sync-now` – Đồng bộ số liệu ngay
- `GET /api/reports/export` – Xuất báo cáo

### 3.10 Returns

- `GET /api/returns` – Danh sách yêu cầu hoàn trả
- `POST /api/returns` – Tạo yêu cầu hoàn trả (Customer)
- `PUT /api/returns/:id/approve` – Duyệt hoàn trả (Admin/CSKH)
- `PUT /api/returns/:id/reject` – Từ chối
- `PUT /api/returns/:id/complete` – Hoàn tất

### 3.11 Settings – Email báo cáo

- `GET /api/settings/report-subscriptions` – Lấy danh sách email nhận báo cáo theo shop
  - Super Admin không assume shop: có thể truyền `shopId` để xem theo shop
  - Khi assume shop: luôn khóa theo shop hiện tại
- `POST /api/settings/report-subscriptions` – Tạo đăng ký nhận báo cáo
  - Chặn tạo cho shop khác khi đang assume shop
- `PUT /api/settings/report-subscriptions/:id` – Cập nhật
- `DELETE /api/settings/report-subscriptions/:id` – Xóa

### 3.12 Meta

- `GET /api/meta/roles` – Danh sách role (cho dropdown)
- `GET /api/meta/shops` – Danh sách shop (active)

---

## 4. Luồng nghiệp vụ chính

### 4.1. Đăng nhập & chuyển ngữ cảnh shop

1. User đăng nhập `POST /auth/login` → backend trả:
   - `user` (id, email, roles, `activeShop` nếu có)
   - `accessToken`, `refreshToken`
2. Frontend lưu vào `authStore`
3. Khi Super Admin cần quản lý 1 shop:
   - Gọi `POST /auth/assume-shop` với `shopId`
   - Backend:
     - Kiểm tra quyền Super Admin / quyền trong shop
     - Sinh lại token với `shopId` + `impersonating = true`
4. Từ đây, mọi API (Users/Orders/Products/Videos/Reports) sẽ **tự filter theo shopId trong token**.

### 4.2. Tạo user trong shop

1. Super Admin hoặc Admin đang ở:
   - **Không assume shop**: tạo user với `shopId` bắt buộc trong body
   - **Assume shop**: backend tự set `shopId = shopId trong token`
2. Role cho phép trong shop:
   - `staff` – Nhân viên đóng hàng
   - `customer_service` – CSKH
   - `customer` – Khách hàng
3. Backend validate:
   - Không cho phép tạo `admin` / `super_admin` trong shop context
   - Không cho phép tạo user cho shop khác khi đang quản lý shop A

### 4.3. Gửi báo cáo email hằng ngày

1. Cron job lúc 18:00 VN time:
   - Lấy danh sách `ReportSubscription` đang `enabled`
   - Tổng hợp số liệu:
     - Đơn mới trong ngày, doanh thu, trạng thái đơn
     - Video đóng gói/nhận hàng
     - Hàng tồn kho thấp
     - Hiệu suất theo kênh / carrier
2. Gửi email theo `reportType` (`financial` / `operational` / `both`)
3. Lỗi phổ biến trong dev:
   - `getaddrinfo ENOTFOUND e2.vinahost.vn` → cấu hình SMTP demo không resolve được; **không ảnh hưởng** logic hệ thống, chỉ ảnh hưởng gửi email.

### 4.4. Luồng video đóng gói – nhận hàng – so sánh

1. Staff upload video đóng gói:
   - `POST /videos/upload` → `PackageVideo` gắn với `Order`
2. Customer/Staff upload video nhận hàng:
   - `POST /videos/receiving/upload` → `ReceivingVideo` gắn với `Order` / `Customer`
3. So sánh:
   - `GET /videos/:id/compare` → backend đọc dữ liệu, trả thông tin so sánh (logic có thể mở rộng sau).

---

## 5. Bảng test case gợi ý (ưu tiên)

| ID           | Module  | Tên test case                                     | Kỳ vọng                                                        |
|--------------|---------|---------------------------------------------------|----------------------------------------------------------------|
| TC-AUTH-01   | Auth    | Đăng ký thành công                               | 201, trả user + token                                          |
| TC-AUTH-02   | Auth    | Đăng ký email trùng                              | 409, message “Email đã được sử dụng”                           |
| TC-AUTH-03   | Auth    | Đăng nhập đúng                                   | 200, trả accessToken + refreshToken                            |
| TC-AUTH-04   | Auth    | Me với token hết hạn                             | 401 → axios interceptor gọi refresh, sau đó lặp lại request    |
| TC-ASSUME-01 | Auth    | Super Admin assume shop                          | 200, `user.activeShop` có giá trị, token mới có `shopId`       |
| TC-USER-01   | Users   | Super Admin xem danh sách user                   | GET `/users` → 200, có phân trang                              |
| TC-USER-02   | Users   | Staff gọi `/users`                               | 403 (không có quyền)                                           |
| TC-USER-03   | Users   | Tạo Staff trong shop A                           | POST `/users` (assume shop A) → 201, UserRole (staff, shop A)  |
| TC-USER-04   | Users   | Tạo Admin trong shop A (assume shop)             | 400, message “chỉ được tạo Nhân viên/CSKH/Khách hàng”          |
| TC-USER-05   | Users   | Xóa user là chủ shop                             | Nếu có Super Admin khác → tự chuyển shop, 204                  |
| TC-ORD-01    | Orders  | Tạo đơn + cập nhật trạng thái                    | 201 → 200, `OrderStatusHistory` có log                         |
| TC-VID-01    | Videos  | Staff upload video đóng gói                      | 201, `PackageVideo` gắn với `Order`                            |
| TC-VID-02    | Videos  | Customer upload video nhận hàng                  | 201, `ReceivingVideo` gắn với `Order` + `customerId`           |
| TC-VID-03    | Videos  | CSKH xem tất cả video trong shop                 | GET `/videos` (assume shop) → chỉ video của shop               |
| TC-RET-01    | Returns | Customer tạo yêu cầu hoàn trả                    | 201, `ReturnRequest` ở trạng thái `pending`                    |
| TC-RET-02    | Returns | CSKH duyệt từ chối hoàn trả                      | `PUT /returns/:id/reject` → status `rejected`                  |
| TC-SET-01    | Settings| Tạo email nhận báo cáo trong shop A              | POST `/settings/report-subscriptions` (assume shop A) → 201    |
| TC-SET-02    | Settings| Tạo email cho shop B khi đang ở shop A           | 403, message “Không thể thêm email cho shop khác …”            |
| TC-REP-01    | Reports | Dashboard theo shop                              | GET `/reports/dashboard` với Super Admin/Assume shop → 200     |

---

## 6. Bảng module & trạng thái triển khai

| Module        | Tính năng chính                                         | Backend | Frontend | Ghi chú ngắn                                      |
|---------------|---------------------------------------------------------|:-------:|:--------:|--------------------------------------------------|
| Auth          | Đăng nhập/Đăng ký/Refresh/Me/Change password           | ✅       | ✅        | Hoàn chỉnh                                       |
| Auth – Assume | Chuyển ngữ cảnh shop                                   | ✅       | ✅        | Dùng trên `ShopsPage`                            |
| Users         | Danh sách, CRUD, gán/gỡ role                           | ✅       | ✅        | UI quản lý role đã cải thiện                     |
| Shops         | Danh sách, tạo, xóa/vô hiệu hóa                        | ✅       | ✅        | Chỉ Super Admin tạo/xóa                          |
| Orders        | CRUD, trạng thái, tracking                             | ✅       | ✅        | Đã nối Dashboard/Reports                         |
| Products      | CRUD, tồn kho, danh mục                                | ✅       | ✅        | Hoạt động trong phạm vi shop                     |
| Videos        | Danh sách, upload, approve, compare                    | ✅       | ⚠️        | UI so sánh có thể tiếp tục nâng cấp              |
| Shipping      | Hãng VC, tính phí, tracking, cấu hình shop             | ✅       | ⚠️        | CẤU HÌNH UI chưa đầy đủ                          |
| Channels      | Kết nối kênh, đồng bộ đơn/sản phẩm                     | ✅       | ⚠️        | Dừng ở mức API + tích hợp cơ bản                 |
| Reports       | Dashboard, báo cáo orders/videos/revenue/operational   | ✅       | ✅        | Giao diện ReportsPage                            |
| Returns       | Tạo & xử lý hoàn trả                                   | ✅       | ⚠️        | UI chưa full tất cả nhánh trạng thái             |
| Settings      | Email nhận báo cáo theo shop                           | ✅       | ✅        | Đã khóa theo shop context                        |
| Meta          | Roles, Shops (cho dropdown)                            | ✅       | ✅        | Dùng rộng khắp FE                                |
| Dashboard     | Thống kê tổng quan theo shop/ngày                      | ✅       | ✅        | Trang DashboardPage                              |
| Notification  | Thông báo realtime / in-app                            | ❌       | ❌        | Dự kiến dùng websockets / SSE                    |
| Audit log     | Ghi lịch sử thao tác                                   | ❌       | ❌        | Dự kiến log theo entity                          |

---

## 7. Tương tác hệ thống (high-level)

| Từ (Actor/Module)               | Tới (Module/Entity)                | Mô tả ngắn                                                                 |
|---------------------------------|------------------------------------|----------------------------------------------------------------------------|
| User (khách)                    | Auth                               | Đăng ký/Đăng nhập, nhận JWT                                               |
| Frontend                        | Auth middleware (backend)          | Gửi Bearer token, backend decode & map `req.user`                         |
| Auth middleware                 | RolePermission                     | Kiểm tra quyền dựa trên role + shopId                                     |
| Super Admin                     | Shops, Users                       | Tạo shop, tạo Admin, gán Admin cho shop                                   |
| Admin/SA trong shop            | Users                              | Tạo Staff/CSKH/Customer, gán role scoped theo shop                        |
| Staff                           | Orders, Products, PackageVideo     | Tạo đơn, cập nhật trạng thái, upload video đóng gói                       |
| Customer/Staff                  | ReceivingVideo, Returns            | Upload video nhận hàng, tạo request hoàn trả                              |
| CSKH                            | Returns, Orders, Shipping          | Xử lý hoàn trả, cập nhật đơn, xem vận chuyển                              |
| Reports scheduler               | ReportSubscription, Orders,…       | Chạy hằng ngày, gửi email báo cáo                                         |
| Channels                        | Orders, Products                   | Đồng bộ đơn & sản phẩm từ sàn về EcoHub                                   |
| Shipping                        | Carriers, ShopCarrierSetting       | Tính phí, tracking theo hãng + cấu hình shop                              |
| Dashboard/ReportsPage           | Orders, Products, Videos, Users    | Render biểu đồ + bảng thống kê                                            |

---

## 8. Migration & seed

Khi setup mới (đặc biệt sau khi đổi schema: thêm role, field mới,…):

```bash
cd backend

# Áp dụng migration DB
npx prisma migrate deploy

# Sinh lại Prisma Client
npx prisma generate

# Seed dữ liệu: roles, permissions, super admin, demo shop & data
npx prisma db seed
```

Khi làm việc ở môi trường dev, có thể dùng:

```bash
npx prisma migrate dev
npx prisma db seed
```

---

_Tài liệu này được sinh từ trạng thái code hiện tại, đã cập nhật các thay đổi mới nhất về quyền role, ngữ cảnh shop và email báo cáo._ 
