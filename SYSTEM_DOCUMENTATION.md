# EcoHub - Tài Liệu Chi Tiết Hệ Thống

## Mục Lục
1. [Tổng Quan Hệ Thống](#1-tổng-quan-hệ-thống)
2. [Kiến Trúc Hệ Thống](#2-kiến-trúc-hệ-thống)
3. [Các Module Chức Năng](#3-các-module-chức-năng)
4. [Database Schema](#4-database-schema)
5. [Quy Trình Xử Lý](#5-quy-trình-xử-lý)
6. [API Endpoints](#6-api-endpoints)
7. [Bảo Mật](#7-bảo-mật)
8. [Deployment](#8-deployment)

---

## 1. Tổng Quan Hệ Thống

### 1.1 Giới Thiệu
**EcoHub** là hệ thống quản lý đơn hàng, đóng gói sản phẩm và quay video đóng gói với tích hợp mã vận đơn. Hệ thống được thiết kế để hỗ trợ:

- **Quản lý đa shop**: Một hệ thống có thể quản lý nhiều shop/cửa hàng
- **Tích hợp đa kênh**: Kết nối với 10+ kênh bán hàng (TikTok Shop, Shopee, Lazada, Shopify, Pancake, Kiot, Haravan, Sapo, SapoOmni, Nhanh)
- **Tích hợp đa hãng vận chuyển**: Hỗ trợ 39+ hãng vận chuyển (GHN, GHTK, ViettelPost, SPX, J&T, NinjaVan, BEST, Ahamove, GrabExpress, VNPost, ...)
- **Video đóng gói**: Quay video quá trình đóng gói và tự động tích hợp mã vận đơn vào video
- **So sánh video**: So sánh video đóng gói với video nhận hàng để phát hiện sai sót

### 1.2 Mục Tiêu Hệ Thống
- Tự động hóa quy trình quản lý đơn hàng từ nhiều kênh bán hàng
- Tăng tính minh bạch thông qua video đóng gói có mã vận đơn
- Giảm thiểu sai sót trong quá trình đóng gói và vận chuyển
- Cung cấp báo cáo và thống kê chi tiết
- Hỗ trợ quản lý trả hàng và khiếu nại

### 1.3 Đối Tượng Sử Dụng
- **Super Admin**: Quản trị viên hệ thống, có toàn quyền
- **Admin**: Quản trị viên shop, quản lý shop của mình
- **Staff**: Nhân viên đóng gói, quay video, xử lý đơn hàng
- **Customer**: Khách hàng, tra cứu đơn hàng và video đóng gói

---

## 2. Kiến Trúc Hệ Thống

### 2.1 Kiến Trúc Tổng Thể

```
┌─────────────────────────────────────────────────────────────┐
│                        Client Layer                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   Web App    │  │  Mobile App  │  │  Public API  │     │
│  │  (React)     │  │  (Future)    │  │  (Tracking)  │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    Nginx Reverse Proxy                      │
│  - Load Balancing  - SSL Termination  - Rate Limiting       │
│  - Caching         - Security Headers - Request Routing     │
└─────────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│   Frontend   │   │    Backend    │   │   Static     │
│   (Vite)     │   │   (Express)   │   │   Files      │
└──────────────┘   └──────────────┘   └──────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│  PostgreSQL  │   │     Redis    │   │  Cloud       │
│  Database    │   │     Cache    │   │  Storage     │
└──────────────┘   └──────────────┘   └──────────────┘
```

### 2.2 Kiến Trúc Backend (N-Tier)

```
┌─────────────────────────────────────────────────────────┐
│                    Presentation Layer                    │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐       │
│  │  Routes    │  │ Controllers │  │ Middleware │       │
│  └────────────┘  └────────────┘  └────────────┘       │
└─────────────────────────────────────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────┐
│                     Business Logic Layer                 │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐       │
│  │  Services  │  │   Utils    │  │ Validators │       │
│  └────────────┘  └────────────┘  └────────────┘       │
└─────────────────────────────────────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────┐
│                      Data Access Layer                     │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐       │
│  │   Prisma   │  │    Redis   │  │  External  │       │
│  │    ORM     │  │   Cache    │  │    APIs    │       │
│  └────────────┘  └────────────┘  └────────────┘       │
└─────────────────────────────────────────────────────────┘
```

### 2.3 Cấu Trúc Module Backend

```
backend/src/
├── config/              # Cấu hình (database, environment)
├── middlewares/         # Express middlewares
│   ├── auth.middleware.ts      # JWT authentication
│   ├── validation.middleware.ts # Request validation
│   ├── error.middleware.ts     # Error handling
│   └── upload.middleware.ts    # File upload
├── modules/             # Feature modules
│   ├── auth/           # Authentication & Authorization
│   ├── users/          # User management
│   ├── orders/         # Order management
│   ├── products/       # Product management
│   ├── videos/         # Video processing
│   ├── shipping/       # Shipping carrier integration
│   ├── channels/       # Sales channel integration
│   ├── reports/        # Reports & Analytics
│   └── returns/        # Return management
└── utils/              # Utility functions
```

### 2.4 Cấu Trúc Frontend

```
frontend/src/
├── api/                # API service layer
├── components/         # Reusable components
│   ├── ui/            # Base UI components
│   └── layout/        # Layout components
├── features/          # Feature modules
│   ├── auth/         # Authentication pages
│   ├── dashboard/    # Dashboard
│   ├── orders/       # Order management
│   ├── products/     # Product management
│   ├── videos/       # Video management
│   ├── users/        # User management
│   ├── reports/      # Reports
│   └── tracking/     # Public tracking page
├── store/            # State management (Zustand)
└── utils/           # Utility functions
```

---

## 3. Các Module Chức Năng

### 3.1 Module Quản Lý Người Dùng

#### 3.1.1 Vai Trò (Roles)
- **Super Admin**: Toàn quyền hệ thống
  - Quản lý tất cả shops
  - Quản lý users và roles
  - Cấu hình hệ thống
  - Xem tất cả báo cáo

- **Admin**: Quản trị shop
  - Quản lý shop của mình
  - Quản lý staff trong shop
  - Xem báo cáo shop
  - Quản lý sản phẩm, đơn hàng

- **Staff**: Nhân viên
  - Xem và xử lý đơn hàng
  - Quay video đóng gói
  - Cập nhật trạng thái đơn hàng
  - Xem sản phẩm

- **Customer**: Khách hàng
  - Tra cứu đơn hàng
  - Xem video đóng gói
  - Tạo yêu cầu trả hàng
  - Upload video nhận hàng

#### 3.1.2 Phân Quyền (Permissions)
Hệ thống sử dụng **Role-Based Access Control (RBAC)** kết hợp với **Permission-Based Authorization**:

```
Module: users
- users.view
- users.create
- users.update
- users.delete
- users.assign_role

Module: orders
- orders.view
- orders.create
- orders.update
- orders.delete
- orders.change_status

Module: products
- products.view
- products.create
- products.update
- products.delete

Module: videos
- videos.view
- videos.upload
- videos.approve
- videos.delete

Module: reports
- reports.view
- reports.export
```

#### 3.1.3 Chức Năng
- Đăng ký/Đăng nhập với JWT
- Quản lý profile
- Phân quyền theo shop (multi-tenant)
- Quản lý sessions và tokens

### 3.2 Module Quản Lý Shop

#### 3.2.1 Chức Năng
- Tạo và quản lý shop
- Mỗi shop có owner (Admin)
- Shop có thể kết nối nhiều kênh bán hàng
- Shop có thể cấu hình nhiều hãng vận chuyển
- Quản lý kho hàng (warehouse)

#### 3.2.2 Dữ Liệu Shop
- Thông tin cơ bản: tên, mã, địa chỉ, liên hệ
- Logo và branding
- Cấu hình kênh bán hàng (API keys, tokens)
- Cấu hình hãng vận chuyển (API keys, settings)
- Danh sách kho hàng

### 3.3 Module Quản Lý Sản Phẩm

#### 3.3.1 Chức Năng
- CRUD sản phẩm
- Quản lý danh mục (category) có phân cấp
- Quản lý tồn kho (inventory)
- Upload hình ảnh sản phẩm
- Quản lý SKU, barcode
- Theo dõi giá vốn, giá bán

#### 3.3.2 Dữ Liệu Sản Phẩm
- Thông tin cơ bản: tên, mô tả, SKU
- Giá: giá bán, giá vốn
- Kích thước: chiều dài, rộng, cao, trọng lượng
- Hình ảnh (JSON array)
- Trạng thái: active, inactive, out_of_stock
- Tồn kho: số lượng, mức tồn kho tối thiểu

### 3.4 Module Quản Lý Đơn Hàng

#### 3.4.1 Quy Trình Đơn Hàng

```
1. Tạo đơn hàng (pending)
   ├─ Từ kênh bán hàng (sync)
   └─ Tạo thủ công

2. Xác nhận đơn hàng (confirmed)
   └─ Admin/Staff xác nhận

3. Đóng gói (packing → packed)
   ├─ Nhân viên lấy sản phẩm
   ├─ Quay video đóng gói
   └─ Tạo mã vận đơn

4. Vận chuyển (shipping)
   └─ Giao cho hãng vận chuyển

5. Giao hàng (delivered)
   └─ Hãng vận chuyển xác nhận

6. Hoàn thành (completed)
   └─ Khách hàng xác nhận nhận hàng

7. Hủy đơn (cancelled)
   └─ Trước khi đóng gói

8. Trả hàng (returned)
   └─ Khách hàng yêu cầu trả hàng
```

#### 3.4.2 Dữ Liệu Đơn Hàng
- **Thông tin đơn hàng**:
  - Mã đơn hàng (orderCode)
  - Kênh bán hàng (channelId, channelOrderId)
  - Shop (shopId)

- **Thông tin khách hàng**:
  - Tên, số điện thoại, email
  - Địa chỉ giao hàng (đầy đủ: tỉnh, huyện, xã)

- **Thông tin vận chuyển**:
  - Hãng vận chuyển (carrierId)
  - Mã vận đơn (trackingCode)
  - Phí vận chuyển (shippingFee)
  - COD amount

- **Giá trị đơn hàng**:
  - Tổng tiền sản phẩm (subtotal)
  - Giảm giá (discountAmount)
  - Tổng cộng (totalAmount)

- **Trạng thái**:
  - Trạng thái đơn hàng (OrderStatus)
  - Trạng thái thanh toán (PaymentStatus)

- **Timestamps**:
  - confirmedAt, packedAt, shippedAt, deliveredAt, completedAt

#### 3.4.3 Order Items
- ProductId (có thể null nếu sản phẩm đã xóa)
- ProductName, ProductSku (lưu snapshot)
- Quantity, UnitPrice, TotalPrice

#### 3.4.4 Order Status History
- Lưu lịch sử thay đổi trạng thái
- Ghi lại người thay đổi và thời gian

### 3.5 Module Quản Lý Video

#### 3.5.1 Video Đóng Gói (PackageVideo)

**Quy trình xử lý video**:
```
1. Upload video gốc
   └─ Staff quay video quá trình đóng gói

2. Xử lý video (processing)
   ├─ Extract frames
   ├─ Tích hợp mã vận đơn vào video
   │  └─ Overlay tracking code tại vị trí chỉ định
   │     (top_left, top_right, bottom_left, bottom_right)
   ├─ Tạo thumbnail
   └─ Compress video

3. Hoàn thành (completed)
   └─ Video đã được xử lý

4. Phê duyệt (approved)
   └─ Admin/Staff phê duyệt video

5. Lỗi (failed)
   └─ Xử lý video thất bại
```

**Dữ Liệu Video Đóng Gói**:
- OrderId, TrackingCode
- OriginalVideoUrl, OriginalVideoSize, OriginalDuration
- ProcessedVideoUrl, ProcessedVideoSize
- ThumbnailUrl
- ProcessingStatus, ProcessingError
- TrackingCodePosition, TrackingCodeStartTime, TrackingCodeEndTime
- RecordedBy, ApprovedBy, ApprovedAt

#### 3.5.2 Video Nhận Hàng (ReceivingVideo)

**Chức năng**:
- Khách hàng upload video khi nhận hàng
- Hệ thống so sánh với video đóng gói
- Phát hiện sai sót (mismatched)

**Dữ Liệu Video Nhận Hàng**:
- OrderId, CustomerId, TrackingCode
- VideoUrl, VideoSize, Duration, ThumbnailUrl
- PackageVideoId (liên kết với video đóng gói)
- ComparisonStatus (pending, matched, mismatched, disputed)
- ComparisonNotes
- RecordedAt

#### 3.5.3 So Sánh Video

**Quy trình so sánh**:
1. Khách hàng upload video nhận hàng
2. Hệ thống tự động so sánh với video đóng gói
3. Sử dụng AI/Computer Vision để:
   - So sánh sản phẩm
   - Kiểm tra số lượng
   - Phát hiện hư hỏng
4. Kết quả: matched, mismatched, hoặc disputed
5. Admin xem xét và xử lý

### 3.6 Module Tích Hợp Kênh Bán Hàng

#### 3.6.1 Kênh Bán Hàng Hỗ Trợ
1. **TikTok Shop**
2. **Shopee**
3. **Lazada**
4. **Shopify**
5. **Pancake**
6. **Kiot**
7. **Haravan**
8. **Sapo**
9. **SapoOmni**
10. **Nhanh**

#### 3.6.2 Chức Năng
- **Kết nối kênh**: Shop kết nối với kênh bán hàng thông qua API
- **Đồng bộ đơn hàng**: Tự động lấy đơn hàng từ kênh
- **Cập nhật trạng thái**: Cập nhật trạng thái đơn hàng lên kênh
- **Quản lý kết nối**: Xem trạng thái kết nối, refresh token

#### 3.6.3 Dữ Liệu Kết Nối
- ShopId, ChannelId
- ChannelShopId (ID shop trên kênh)
- AccessToken, RefreshToken, TokenExpiresAt
- Status (connected, disconnected, error)
- LastSyncAt

### 3.7 Module Tích Hợp Hãng Vận Chuyển

#### 3.7.1 Hãng Vận Chuyển Hỗ Trợ
Hệ thống hỗ trợ 39+ hãng vận chuyển, bao gồm:
- **GHN** (Giao Hàng Nhanh) - Hỗ trợ cồng kềnh
- **GHTK** (Giao Hàng Tiết Kiệm)
- **VTP** (ViettelPost) - Hỗ trợ cồng kềnh
- **SPX** (SPX Express) - Hỗ trợ cồng kềnh
- **JT** (J&T Express)
- **NJV** (NinjaVan) - Hỗ trợ cồng kềnh
- **BEST** (BEST Express)
- **AHAMOVE** (Ahamove)
- **GRAB** (GrabExpress)
- **VNP** (VNPost)
- ... và nhiều hãng khác

#### 3.7.2 Chức Năng
- **Tạo vận đơn**: Tạo mã vận đơn từ hãng vận chuyển
- **Tra cứu vận đơn**: Lấy thông tin vận đơn từ hãng
- **Cập nhật trạng thái**: Webhook từ hãng cập nhật trạng thái
- **Tính phí vận chuyển**: Tính phí dựa trên địa chỉ, kích thước
- **Hỗ trợ cồng kềnh**: Một số hãng hỗ trợ hàng cồng kềnh

#### 3.7.3 Dữ Liệu Hãng Vận Chuyển
- Code, Name, LogoUrl
- BaseShippingFee
- ApiBaseUrl
- IsBulkySupported (hỗ trợ cồng kềnh)
- Status (active, inactive)

#### 3.7.4 Cấu Hình Shop
- ShopId, CarrierId
- ApiKey, ApiSecret
- ShopCarrierId (ID shop trên hệ thống hãng)
- IsDefault (hãng mặc định)
- Status

### 3.8 Module Quản Lý Trả Hàng

#### 3.8.1 Quy Trình Trả Hàng

```
1. Khách hàng tạo yêu cầu trả hàng (pending)
   ├─ Chọn lý do trả hàng
   ├─ Upload hình ảnh
   └─ Mô tả chi tiết

2. Admin xem xét (approved/rejected)
   ├─ Xem video đóng gói và video nhận hàng
   ├─ Xem hình ảnh khách hàng gửi
   └─ Quyết định chấp nhận/từ chối

3. Xử lý trả hàng (processing)
   └─ Nhận hàng về, kiểm tra

4. Hoàn thành (completed)
   ├─ Hoàn tiền cho khách hàng
   └─ Cập nhật tồn kho
```

#### 3.8.2 Lý Do Trả Hàng
- damaged (hư hỏng)
- wrong_item (sai sản phẩm)
- defective (lỗi sản phẩm)
- not_as_described (không đúng mô tả)
- other (khác)

#### 3.8.3 Dữ Liệu Trả Hàng
- OrderId, CustomerId
- Reason, Description, Images (JSON)
- Status (pending, approved, rejected, processing, completed)
- ReviewedBy, ReviewedAt, ReviewNotes
- RefundAmount, RefundedAt

### 3.9 Module Báo Cáo & Thống Kê

#### 3.9.1 Dashboard Tổng Quan
- Tổng số đơn hàng (theo trạng thái)
- Doanh thu (ngày, tuần, tháng)
- Số lượng video đã quay
- Tỷ lệ đơn hàng thành công
- Top sản phẩm bán chạy
- Biểu đồ xu hướng

#### 3.9.2 Báo Cáo Đơn Hàng
- Báo cáo theo trạng thái
- Báo cáo theo kênh bán hàng
- Báo cáo theo hãng vận chuyển
- Báo cáo theo thời gian (ngày, tuần, tháng, năm)
- Báo cáo theo nhân viên

#### 3.9.3 Báo Cáo Doanh Thu
- Doanh thu theo thời gian
- Doanh thu theo kênh
- Doanh thu theo sản phẩm
- Lợi nhuận (revenue - cost)

#### 3.9.4 Báo Cáo Video
- Số lượng video đã quay
- Tỷ lệ video được phê duyệt
- Thời gian xử lý video trung bình
- Video có vấn đề (mismatched)

#### 3.9.5 Báo Cáo Trả Hàng
- Tỷ lệ trả hàng
- Lý do trả hàng phổ biến
- Giá trị trả hàng

### 3.10 Module Quản Lý Kho Hàng

#### 3.10.1 Chức Năng
- Quản lý nhiều kho hàng (warehouse)
- Theo dõi tồn kho theo kho
- Lịch sử nhập/xuất kho
- Điều chỉnh tồn kho

#### 3.10.2 Dữ Liệu Kho Hàng
- ShopId, Name, Code, Address
- ContactPhone
- IsDefault (kho mặc định)
- Status

#### 3.10.3 Giao Dịch Tồn Kho
- WarehouseId, ProductId
- TransactionType (in, out, adjustment)
- Quantity
- ReferenceType, ReferenceId (liên kết với đơn hàng, điều chỉnh)
- Note, CreatedBy

---

## 4. Database Schema

### 4.1 Sơ Đồ Quan Hệ

```
User ──┬── UserRole ── Role ── RolePermission ── Permission
       │
       ├── Shop (owner)
       │
       ├── Order (created_by)
       │
       ├── PackageVideo (recorded_by, approved_by)
       │
       ├── ReceivingVideo (customer)
       │
       ├── ReturnRequest (customer, reviewed_by)
       │
       └── InventoryTransaction (created_by)

Shop ──┬── ShopChannelConnection ── SalesChannel
       │
       ├── ShopCarrierSetting ── ShippingCarrier
       │
       ├── ProductCategory
       │
       ├── Product
       │
       ├── Order
       │
       └── Warehouse

Order ──┬── OrderItem ── Product
        │
        ├── OrderStatusHistory
        │
        ├── PackageVideo
        │
        ├── ReceivingVideo
        │
        └── ReturnRequest

PackageVideo ── ReceivingVideo
```

### 4.2 Các Bảng Chính

#### 4.2.1 User Management
- **users**: Thông tin người dùng
- **roles**: Vai trò (super_admin, admin, staff, customer)
- **user_roles**: Phân vai trò cho user (có thể theo shop)
- **permissions**: Quyền hạn
- **role_permissions**: Phân quyền cho vai trò

#### 4.2.2 Shop & Integration
- **shops**: Thông tin shop
- **sales_channels**: Danh sách kênh bán hàng
- **shop_channel_connections**: Kết nối shop với kênh
- **shipping_carriers**: Danh sách hãng vận chuyển
- **shop_carrier_settings**: Cấu hình hãng vận chuyển cho shop

#### 4.2.3 Products
- **product_categories**: Danh mục sản phẩm (phân cấp)
- **products**: Sản phẩm

#### 4.2.4 Orders
- **orders**: Đơn hàng
- **order_items**: Chi tiết đơn hàng
- **order_status_history**: Lịch sử thay đổi trạng thái

#### 4.2.5 Videos
- **package_videos**: Video đóng gói
- **receiving_videos**: Video nhận hàng

#### 4.2.6 Returns
- **return_requests**: Yêu cầu trả hàng

#### 4.2.7 Warehouse
- **warehouses**: Kho hàng
- **inventory_transactions**: Giao dịch tồn kho

#### 4.2.8 Notifications
- **notifications**: Thông báo

### 4.3 Enums

#### 4.3.1 UserStatus
- active
- inactive
- suspended

#### 4.3.2 RoleName
- super_admin
- admin
- staff
- customer

#### 4.3.3 OrderStatus
- pending
- confirmed
- packing
- packed
- shipping
- delivered
- completed
- cancelled
- returned

#### 4.3.4 PaymentStatus
- pending
- paid
- refunded

#### 4.3.5 VideoProcessingStatus
- uploaded
- processing
- completed
- failed

#### 4.3.6 ComparisonStatus
- pending
- matched
- mismatched
- disputed

#### 4.3.7 ReturnStatus
- pending
- approved
- rejected
- processing
- completed

#### 4.3.8 ReturnReason
- damaged
- wrong_item
- defective
- not_as_described
- other

---

## 5. Quy Trình Xử Lý

### 5.1 Quy Trình Đơn Hàng Hoàn Chỉnh

```
┌─────────────────────────────────────────────────────────┐
│ 1. Tạo Đơn Hàng                                         │
│    ├─ Đồng bộ từ kênh bán hàng                         │
│    └─ Hoặc tạo thủ công                                 │
│    → Status: pending                                    │
└─────────────────────────────────────────────────────────┘
                        ▼
┌─────────────────────────────────────────────────────────┐
│ 2. Xác Nhận Đơn Hàng                                    │
│    └─ Admin/Staff xác nhận                              │
│    → Status: confirmed                                  │
└─────────────────────────────────────────────────────────┘
                        ▼
┌─────────────────────────────────────────────────────────┐
│ 3. Đóng Gói                                             │
│    ├─ Status: packing                                   │
│    ├─ Nhân viên lấy sản phẩm từ kho                     │
│    ├─ Quay video quá trình đóng gói                     │
│    ├─ Upload video                                      │
│    ├─ Tạo mã vận đơn từ hãng vận chuyển                 │
│    ├─ Xử lý video (tích hợp mã vận đơn)                 │
│    └─ Status: packed                                    │
└─────────────────────────────────────────────────────────┘
                        ▼
┌─────────────────────────────────────────────────────────┐
│ 4. Vận Chuyển                                           │
│    ├─ Giao hàng cho hãng vận chuyển                     │
│    ├─ Cập nhật trạng thái lên kênh bán hàng             │
│    └─ Status: shipping                                  │
└─────────────────────────────────────────────────────────┘
                        ▼
┌─────────────────────────────────────────────────────────┐
│ 5. Giao Hàng                                            │
│    ├─ Hãng vận chuyển cập nhật (webhook)                │
│    ├─ Khách hàng có thể upload video nhận hàng          │
│    └─ Status: delivered                                 │
└─────────────────────────────────────────────────────────┘
                        ▼
┌─────────────────────────────────────────────────────────┐
│ 6. Hoàn Thành                                           │
│    ├─ Khách hàng xác nhận nhận hàng                     │
│    ├─ So sánh video (nếu có)                            │
│    └─ Status: completed                                 │
└─────────────────────────────────────────────────────────┘
```

### 5.2 Quy Trình Xử Lý Video

```
┌─────────────────────────────────────────────────────────┐
│ 1. Upload Video                                         │
│    └─ Staff upload video gốc                           │
│    → ProcessingStatus: uploaded                          │
└─────────────────────────────────────────────────────────┘
                        ▼
┌─────────────────────────────────────────────────────────┐
│ 2. Xử Lý Video                                          │
│    ├─ ProcessingStatus: processing                      │
│    ├─ Extract frames                                    │
│    ├─ Tích hợp mã vận đơn vào video                     │
│    │  └─ Overlay tại vị trí chỉ định                    │
│    ├─ Tạo thumbnail                                     │
│    ├─ Compress video                                    │
│    └─ Upload lên cloud storage                          │
│    → ProcessingStatus: completed                        │
└─────────────────────────────────────────────────────────┘
                        ▼
┌─────────────────────────────────────────────────────────┐
│ 3. Phê Duyệt                                            │
│    └─ Admin/Staff phê duyệt video                       │
│    → ApprovedBy, ApprovedAt                            │
└─────────────────────────────────────────────────────────┘
```

### 5.3 Quy Trình Trả Hàng

```
┌─────────────────────────────────────────────────────────┐
│ 1. Khách Hàng Tạo Yêu Cầu                               │
│    ├─ Chọn lý do trả hàng                               │
│    ├─ Upload hình ảnh                                   │
│    └─ Mô tả chi tiết                                    │
│    → Status: pending                                    │
└─────────────────────────────────────────────────────────┘
                        ▼
┌─────────────────────────────────────────────────────────┐
│ 2. Admin Xem Xét                                        │
│    ├─ Xem video đóng gói                                │
│    ├─ Xem video nhận hàng (nếu có)                      │
│    ├─ Xem hình ảnh khách hàng gửi                       │
│    └─ Quyết định: approved/rejected                     │
└─────────────────────────────────────────────────────────┘
                        ▼
┌─────────────────────────────────────────────────────────┐
│ 3. Xử Lý Trả Hàng (nếu approved)                        │
│    ├─ Status: processing                                 │
│    ├─ Nhận hàng về                                      │
│    ├─ Kiểm tra sản phẩm                                 │
│    └─ Cập nhật tồn kho                                  │
└─────────────────────────────────────────────────────────┘
                        ▼
┌─────────────────────────────────────────────────────────┐
│ 4. Hoàn Tiền                                            │
│    ├─ Tính toán số tiền hoàn                             │
│    ├─ Hoàn tiền cho khách hàng                          │
│    └─ Status: completed                                 │
└─────────────────────────────────────────────────────────┘
```

### 5.4 Quy Trình Đồng Bộ Đơn Hàng Từ Kênh

```
┌─────────────────────────────────────────────────────────┐
│ 1. Kết Nối Kênh                                         │
│    ├─ Shop kết nối với kênh bán hàng                     │
│    ├─ Lưu access_token, refresh_token                    │
│    └─ Status: connected                                 │
└─────────────────────────────────────────────────────────┘
                        ▼
┌─────────────────────────────────────────────────────────┐
│ 2. Đồng Bộ Đơn Hàng (Scheduled/Manual)                   │
│    ├─ Gọi API kênh để lấy đơn hàng mới                   │
│    ├─ Tạo đơn hàng trong hệ thống                       │
│    ├─ Map dữ liệu từ kênh sang hệ thống                  │
│    └─ Cập nhật LastSyncAt                               │
└─────────────────────────────────────────────────────────┘
                        ▼
┌─────────────────────────────────────────────────────────┐
│ 3. Cập Nhật Trạng Thái                                  │
│    ├─ Khi đơn hàng thay đổi trạng thái                   │
│    └─ Gọi API kênh để cập nhật                          │
└─────────────────────────────────────────────────────────┘
```

---

## 6. API Endpoints

### 6.1 Authentication APIs

| Method | Endpoint | Mô tả | Auth |
|--------|----------|-------|------|
| POST | `/api/auth/register` | Đăng ký tài khoản | Public |
| POST | `/api/auth/login` | Đăng nhập | Public |
| POST | `/api/auth/refresh-token` | Làm mới token | Public |
| GET | `/api/auth/me` | Lấy thông tin user hiện tại | Required |

### 6.2 User Management APIs

| Method | Endpoint | Mô tả | Roles |
|--------|----------|-------|-------|
| GET | `/api/users` | Danh sách users | super_admin, admin |
| GET | `/api/users/:id` | Chi tiết user | super_admin, admin |
| POST | `/api/users` | Tạo user | super_admin, admin |
| PUT | `/api/users/:id` | Cập nhật user | super_admin, admin |
| DELETE | `/api/users/:id` | Xóa user | super_admin |
| POST | `/api/users/:id/roles` | Gán vai trò | super_admin, admin |

### 6.3 Order Management APIs

| Method | Endpoint | Mô tả | Roles |
|--------|----------|-------|-------|
| GET | `/api/orders` | Danh sách đơn hàng | All |
| GET | `/api/orders/:id` | Chi tiết đơn hàng | All |
| POST | `/api/orders` | Tạo đơn hàng | admin, staff |
| PUT | `/api/orders/:id` | Cập nhật đơn hàng | admin, staff |
| PATCH | `/api/orders/:id/status` | Thay đổi trạng thái | admin, staff |
| GET | `/api/orders/tracking/:code` | Tra cứu đơn hàng | Public |

### 6.4 Product Management APIs

| Method | Endpoint | Mô tả | Roles |
|--------|----------|-------|-------|
| GET | `/api/products` | Danh sách sản phẩm | All |
| GET | `/api/products/:id` | Chi tiết sản phẩm | All |
| POST | `/api/products` | Tạo sản phẩm | admin, staff |
| PUT | `/api/products/:id` | Cập nhật sản phẩm | admin, staff |
| DELETE | `/api/products/:id` | Xóa sản phẩm | admin |

### 6.5 Video Management APIs

| Method | Endpoint | Mô tả | Roles |
|--------|----------|-------|-------|
| GET | `/api/videos` | Danh sách video | All |
| GET | `/api/videos/:id` | Chi tiết video | All |
| POST | `/api/videos/upload` | Upload video đóng gói | staff |
| POST | `/api/videos/:id/approve` | Phê duyệt video | admin, staff |
| POST | `/api/videos/receiving` | Upload video nhận hàng | customer |
| GET | `/api/videos/tracking/:code` | Video theo mã vận đơn | Public |

### 6.6 Shipping APIs

| Method | Endpoint | Mô tả | Roles |
|--------|----------|-------|-------|
| GET | `/api/shipping/carriers` | Danh sách hãng vận chuyển | All |
| POST | `/api/shipping/create-order` | Tạo vận đơn | admin, staff |
| GET | `/api/shipping/tracking/:code` | Tra cứu vận đơn | All |
| POST | `/api/shipping/webhook` | Webhook từ hãng | Public |

### 6.7 Channel APIs

| Method | Endpoint | Mô tả | Roles |
|--------|----------|-------|-------|
| GET | `/api/channels` | Danh sách kênh bán hàng | All |
| POST | `/api/channels/:id/connect` | Kết nối kênh | admin |
| GET | `/api/channels/:id/sync` | Đồng bộ đơn hàng | admin, staff |
| GET | `/api/channels/:id/status` | Trạng thái kết nối | admin |

### 6.8 Reports APIs

| Method | Endpoint | Mô tả | Roles |
|--------|----------|-------|-------|
| GET | `/api/reports/dashboard` | Dashboard tổng quan | All |
| GET | `/api/reports/orders` | Báo cáo đơn hàng | admin, super_admin |
| GET | `/api/reports/revenue` | Báo cáo doanh thu | admin, super_admin |
| GET | `/api/reports/videos` | Báo cáo video | admin, super_admin |

### 6.9 Returns APIs

| Method | Endpoint | Mô tả | Roles |
|--------|----------|-------|-------|
| GET | `/api/returns` | Danh sách yêu cầu trả hàng | All |
| POST | `/api/returns` | Tạo yêu cầu trả hàng | customer |
| PATCH | `/api/returns/:id/approve` | Chấp nhận trả hàng | admin |
| PATCH | `/api/returns/:id/reject` | Từ chối trả hàng | admin |

---

## 7. Bảo Mật

### 7.1 Authentication & Authorization

#### 7.1.1 JWT Authentication
- **Access Token**: Thời gian sống ngắn (15 phút - 1 giờ)
- **Refresh Token**: Thời gian sống dài (7-30 ngày)
- Token được lưu trong HTTP-only cookie hoặc localStorage
- Refresh token được lưu trong database hoặc Redis

#### 7.1.2 Password Security
- Mật khẩu được hash bằng bcrypt (10 rounds)
- Yêu cầu mật khẩu mạnh:
  - Tối thiểu 8 ký tự
  - Có chữ hoa, chữ thường, số
  - Có thể yêu cầu ký tự đặc biệt

#### 7.1.3 Role-Based Access Control (RBAC)
- Mỗi user có một hoặc nhiều roles
- Roles có thể được gán theo shop (multi-tenant)
- Super Admin có toàn quyền hệ thống
- Admin chỉ quản lý shop của mình

#### 7.1.4 Permission-Based Authorization
- Mỗi role có nhiều permissions
- API endpoints được bảo vệ bởi permission middleware
- Frontend ẩn/hiện UI dựa trên permissions

### 7.2 API Security

#### 7.2.1 Rate Limiting
- **Nginx**: Rate limiting ở tầng reverse proxy
  - API: 10 requests/second
  - Login: 5 requests/minute
- **Express**: Rate limiting middleware
  - Bảo vệ các endpoint quan trọng

#### 7.2.2 Input Validation
- Sử dụng Zod để validate request body, query, params
- Sanitize input để tránh XSS, SQL injection
- Validate file upload (type, size)

#### 7.2.3 CORS
- Cấu hình CORS cho phép các domain cụ thể
- Preflight requests được xử lý đúng cách

#### 7.2.4 Security Headers (Nginx)
- X-Frame-Options: SAMEORIGIN
- X-Content-Type-Options: nosniff
- X-XSS-Protection: 1; mode=block
- Referrer-Policy: strict-origin-when-cross-origin
- HSTS (khi có HTTPS)

### 7.3 Data Security

#### 7.3.1 Database
- Sử dụng prepared statements (Prisma)
- Không lưu mật khẩu dạng plain text
- Encrypt sensitive data nếu cần

#### 7.3.2 File Upload
- Validate file type (chỉ cho phép video, image)
- Giới hạn kích thước file (500MB cho video)
- Lưu file trên cloud storage (S3, GCS)
- Scan virus nếu có thể

#### 7.3.3 API Keys & Tokens
- Lưu API keys trong environment variables
- Không commit secrets vào git
- Rotate tokens định kỳ

### 7.4 Multi-Tenant Security

#### 7.4.1 Shop Isolation
- Mỗi shop chỉ thấy dữ liệu của mình
- User roles được gán theo shop
- Admin chỉ quản lý shop của mình

#### 7.4.2 Data Access Control
- Middleware kiểm tra shopId trong request
- Database queries tự động filter theo shopId
- Super Admin có thể xem tất cả shops

---

## 8. Deployment

### 8.1 Infrastructure

#### 8.1.1 Development
```
┌─────────────┐
│   Docker    │
│  Compose    │
└─────────────┘
      │
      ├── Nginx (port 80)
      ├── Frontend (Vite dev server)
      ├── Backend (Express)
      ├── PostgreSQL
      └── Redis
```

#### 8.1.2 Production
```
┌─────────────────────────────────────────┐
│         Load Balancer / CDN            │
└─────────────────────────────────────────┘
                  │
        ┌─────────┴─────────┐
        ▼                   ▼
┌──────────────┐   ┌──────────────┐
│   Nginx 1    │   │   Nginx 2    │
│  (Primary)   │   │  (Secondary)  │
└──────────────┘   └──────────────┘
        │                   │
        └─────────┬─────────┘
                  ▼
        ┌─────────────────┐
        │  Backend Cluster │
        │  (Node.js)       │
        └─────────────────┘
                  │
        ┌─────────┴─────────┐
        ▼                   ▼
┌──────────────┐   ┌──────────────┐
│  PostgreSQL  │   │    Redis     │
│  (Primary)   │   │  (Cluster)   │
└──────────────┘   └──────────────┘
        │
        ▼
┌──────────────┐
│  PostgreSQL  │
│  (Replica)   │
└──────────────┘
```

### 8.2 Docker Deployment

#### 8.2.1 Development
```bash
# Chạy tất cả services
docker-compose up -d

# Xem logs
docker-compose logs -f

# Rebuild
docker-compose up -d --build
```

#### 8.2.2 Production
```bash
# Build frontend
cd frontend && npm run build && cd ..

# Chạy production
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### 8.3 Environment Variables

#### 8.3.1 Backend
```env
# Database
DATABASE_URL=postgresql://user:password@host:5432/ecohub

# Redis
REDIS_URL=redis://host:6379

# JWT
JWT_SECRET=your-secret-key
JWT_REFRESH_SECRET=your-refresh-secret
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=7d

# Server
PORT=3000
NODE_ENV=production

# CORS
FRONTEND_URL=https://ecohub.vn

# Cloud Storage
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret
AWS_S3_BUCKET=ecohub-uploads
AWS_REGION=ap-southeast-1

# Shipping Carrier API Keys
GHN_API_KEY=your-key
GHTK_API_KEY=your-key
# ... các hãng khác

# Sales Channel API Keys
SHOPEE_API_KEY=your-key
LAZADA_API_KEY=your-key
# ... các kênh khác
```

#### 8.3.2 Frontend
```env
VITE_API_URL=https://api.ecohub.vn/api
```

### 8.4 Database Migration

```bash
# Tạo migration
npm run db:migrate --workspace=backend

# Chạy migration
npm run db:migrate:deploy --workspace=backend

# Seed dữ liệu
npm run db:seed --workspace=backend
```

### 8.5 Monitoring & Logging

#### 8.5.1 Application Logs
- Backend: Winston hoặc Pino
- Frontend: Console logs (production: disable)
- Nginx: Access logs, error logs

#### 8.5.2 Monitoring
- Health check endpoints
- Database connection monitoring
- API response time
- Error rate tracking

### 8.6 Backup & Recovery

#### 8.6.1 Database Backup
- Automated daily backups
- Retention: 30 days
- Point-in-time recovery

#### 8.6.2 File Backup
- Cloud storage có versioning
- Backup định kỳ

---

## 9. Tích Hợp Bên Thứ Ba

### 9.1 Kênh Bán Hàng

#### 9.1.1 API Integration Pattern
```
1. OAuth Authentication
   └─ Lấy access_token, refresh_token

2. Webhook Registration
   └─ Đăng ký webhook để nhận thông báo

3. Sync Orders
   └─ Gọi API để lấy đơn hàng mới

4. Update Order Status
   └─ Cập nhật trạng thái đơn hàng lên kênh
```

#### 9.1.2 Webhook Handling
- Nhận webhook từ kênh
- Verify signature
- Xử lý event (order.created, order.updated, ...)
- Cập nhật database

### 9.2 Hãng Vận Chuyển

#### 9.2.1 API Integration Pattern
```
1. Create Shipping Order
   └─ Tạo vận đơn, nhận tracking_code

2. Get Shipping Status
   └─ Tra cứu trạng thái vận đơn

3. Webhook
   └─ Nhận thông báo cập nhật trạng thái

4. Calculate Shipping Fee
   └─ Tính phí vận chuyển
```

### 9.3 Cloud Storage

#### 9.3.1 AWS S3 / Google Cloud Storage
- Upload video, image
- Generate signed URLs
- CDN integration

### 9.4 Video Processing

#### 9.4.1 FFmpeg Integration
- Extract frames
- Overlay tracking code
- Create thumbnail
- Compress video

#### 9.4.2 Future: AI/ML Integration
- Video comparison
- Product recognition
- Damage detection

---

## 10. Mở Rộng Tương Lai

### 10.1 Tính Năng Dự Kiến
- Mobile app (React Native)
- Real-time notifications (WebSocket)
- Advanced analytics với AI
- Multi-language support
- Advanced video processing với AI
- Automated inventory management
- Integration với nhiều kênh/hãng hơn

### 10.2 Cải Tiến Kỹ Thuật
- Microservices architecture
- Event-driven architecture
- GraphQL API
- Serverless functions cho video processing
- Kubernetes deployment
- CI/CD pipeline

---

## 11. Tài Liệu Tham Khảo

- [API Documentation](./API_DOCUMENTATION.md)
- [README](./README.md)
- [Prisma Schema](./backend/prisma/schema.prisma)
- [Docker Compose](./docker-compose.yml)

---

**Phiên bản tài liệu**: 1.0.0  
**Cập nhật lần cuối**: 2026-01-26
