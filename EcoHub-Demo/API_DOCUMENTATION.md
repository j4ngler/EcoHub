# EcoHub API Documentation

## Base URL
```
Development: http://localhost:3000/api
Production: https://api.ecohub.vn/api
```

## Authentication
Hệ thống sử dụng JWT (JSON Web Token) để xác thực.

### Headers
```
Authorization: Bearer <access_token>
```

---

## 1. Authentication APIs

### 1.1 Đăng ký tài khoản
```http
POST /auth/register
```

**Request Body:**
```json
{
  "username": "string (3-50 ký tự)",
  "email": "string (email hợp lệ)",
  "password": "string (min 8 ký tự, có chữ hoa, thường, số)",
  "fullName": "string",
  "phone": "string (optional)"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Đăng ký thành công",
  "data": {
    "user": {
      "id": "uuid",
      "username": "string",
      "email": "string",
      "fullName": "string",
      "phone": "string",
      "roles": ["customer"]
    },
    "accessToken": "jwt_token",
    "refreshToken": "jwt_token"
  }
}
```

### 1.2 Đăng nhập
```http
POST /auth/login
```

**Request Body:**
```json
{
  "email": "string",
  "password": "string"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Đăng nhập thành công",
  "data": {
    "user": {
      "id": "uuid",
      "username": "string",
      "email": "string",
      "fullName": "string",
      "roles": ["admin", "staff"]
    },
    "accessToken": "jwt_token",
    "refreshToken": "jwt_token"
  }
}
```

### 1.3 Làm mới Token
```http
POST /auth/refresh-token
```

**Request Body:**
```json
{
  "refreshToken": "string"
}
```

### 1.4 Lấy thông tin user hiện tại
```http
GET /auth/me
```

**Headers:** `Authorization: Bearer <token>`

---

## 2. User Management APIs

### 2.1 Danh sách users
```http
GET /users
```

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| page | number | Trang (default: 1) |
| limit | number | Số item/trang (default: 10, max: 100) |
| search | string | Tìm theo username, email, fullName |
| role | string | Lọc theo role (super_admin, admin, staff, customer) |
| status | string | Lọc theo status (active, inactive, suspended) |

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "username": "string",
      "email": "string",
      "fullName": "string",
      "phone": "string",
      "status": "active",
      "roles": [
        { "id": "uuid", "name": "admin", "shop": { "id": "uuid", "name": "Shop A" } }
      ],
      "createdAt": "2024-01-01T00:00:00Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 100,
    "totalPages": 10
  }
}
```

### 2.2 Chi tiết user
```http
GET /users/:id
```

### 2.3 Tạo user mới
```http
POST /users
```

**Request Body:**
```json
{
  "username": "string",
  "email": "string",
  "password": "string",
  "fullName": "string",
  "phone": "string",
  "status": "active",
  "roleId": "uuid",
  "shopId": "uuid (optional)"
}
```

### 2.4 Cập nhật user
```http
PUT /users/:id
```

### 2.5 Xóa user
```http
DELETE /users/:id
```

---

## 3. Order Management APIs

### 3.1 Danh sách đơn hàng
```http
GET /orders
```

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| page | number | Trang |
| limit | number | Số item/trang |
| search | string | Tìm theo orderCode, trackingCode, customerName, customerPhone |
| status | string | pending, confirmed, packing, packed, shipping, delivered, completed, cancelled, returned |
| shopId | uuid | Lọc theo shop |
| channelId | uuid | Lọc theo kênh bán hàng |
| carrierId | uuid | Lọc theo hãng vận chuyển |
| startDate | date | Từ ngày (YYYY-MM-DD) |
| endDate | date | Đến ngày |

### 3.2 Chi tiết đơn hàng
```http
GET /orders/:id
```

### 3.3 Tra cứu theo mã vận đơn
```http
GET /orders/tracking/:trackingCode
```

### 3.4 Tạo đơn hàng
```http
POST /orders
```

**Request Body:**
```json
{
  "shopId": "uuid",
  "channelId": "uuid (optional)",
  "customerName": "string",
  "customerPhone": "string",
  "customerEmail": "string (optional)",
  "shippingAddress": "string",
  "shippingProvince": "string",
  "shippingDistrict": "string",
  "shippingWard": "string",
  "carrierId": "uuid (optional)",
  "trackingCode": "string (optional, auto-generate if empty)",
  "shippingFee": "number",
  "codAmount": "number",
  "discountAmount": "number",
  "paymentMethod": "string",
  "notes": "string",
  "items": [
    {
      "productId": "uuid (optional)",
      "productName": "string",
      "productSku": "string",
      "quantity": "number",
      "unitPrice": "number"
    }
  ]
}
```

### 3.5 Cập nhật trạng thái đơn hàng
```http
PUT /orders/:id/status
```

**Request Body:**
```json
{
  "status": "confirmed | packing | packed | shipping | delivered | completed | cancelled | returned",
  "note": "string (optional)"
}
```

**Status Flow:**
```
pending → confirmed → packing → packed → shipping → delivered → completed
                                    ↓           ↓
                                cancelled    returned
```

### 3.6 Thống kê đơn hàng
```http
GET /orders/stats
```

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| shopId | uuid | Lọc theo shop |
| startDate | date | Từ ngày |
| endDate | date | Đến ngày |

---

## 4. Product Management APIs

### 4.1 Danh sách sản phẩm
```http
GET /products
```

### 4.2 Chi tiết sản phẩm
```http
GET /products/:id
```

### 4.3 Tạo sản phẩm
```http
POST /products
```

**Request Body:**
```json
{
  "shopId": "uuid",
  "categoryId": "uuid (optional)",
  "sku": "string",
  "name": "string",
  "description": "string",
  "price": "number",
  "costPrice": "number",
  "weight": "number (kg)",
  "length": "number (cm)",
  "width": "number (cm)",
  "height": "number (cm)",
  "stockQuantity": "number",
  "minStockLevel": "number",
  "barcode": "string",
  "images": ["url1", "url2"]
}
```

### 4.4 Cập nhật tồn kho
```http
PUT /products/:id/stock
```

**Request Body:**
```json
{
  "quantity": "number",
  "type": "set | add | subtract"
}
```

---

## 5. Video Management APIs

### 5.1 Danh sách video
```http
GET /videos
```

### 5.2 Chi tiết video
```http
GET /videos/:id
```

### 5.3 Video theo mã vận đơn
```http
GET /videos/tracking/:trackingCode
```

### 5.4 Upload video đóng gói
```http
POST /videos/upload
Content-Type: multipart/form-data
```

**Form Data:**
| Field | Type | Description |
|-------|------|-------------|
| video | file | Video file (MP4, WebM, MOV, AVI - max 500MB) |
| orderId | uuid | ID đơn hàng |
| trackingCode | string | Mã vận đơn (optional, lấy từ order nếu không có) |
| trackingCodePosition | string | top_left, top_right, bottom_left, bottom_right |

### 5.5 Phê duyệt video
```http
PUT /videos/:id/approve
```

### 5.6 So sánh video
```http
GET /videos/:id/compare
```

**Response:**
```json
{
  "success": true,
  "data": {
    "packageVideo": {
      "id": "uuid",
      "trackingCode": "string",
      "videoUrl": "url",
      "thumbnailUrl": "url"
    },
    "receivingVideos": [
      {
        "id": "uuid",
        "videoUrl": "url",
        "comparisonStatus": "pending | matched | mismatched | disputed"
      }
    ]
  }
}
```

---

## 6. Shipping APIs

### 6.1 Danh sách hãng vận chuyển
```http
GET /shipping/carriers
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "code": "GHN",
      "name": "Giao Hàng Nhanh",
      "logoUrl": "url",
      "baseShippingFee": 20000,
      "isBulkySupported": false,
      "status": "active"
    }
  ]
}
```

### 6.2 Tính phí vận chuyển
```http
POST /shipping/calculate-fee
```

**Request Body:**
```json
{
  "carrierId": "uuid (optional - all carriers if empty)",
  "fromProvince": "string",
  "fromDistrict": "string",
  "toProvince": "string",
  "toDistrict": "string",
  "weight": "number (kg)",
  "length": "number (cm)",
  "width": "number (cm)",
  "height": "number (cm)",
  "codAmount": "number"
}
```

### 6.3 Theo dõi vận đơn
```http
GET /shipping/track/:trackingCode
```

---

## 7. Channel Integration APIs

### 7.1 Danh sách kênh bán hàng
```http
GET /channels
```

**Response:** 10 kênh: TikTok, Shopee, Lazada, Shopify, Pancake, Kiot, Haravan, Sapo, SapoOmni, Nhanh

### 7.2 Kết nối kênh
```http
POST /channels/:id/connect
```

### 7.3 Đồng bộ đơn hàng
```http
POST /channels/:id/sync-orders
```

---

## 8. Report APIs

### 8.1 Dashboard
```http
GET /reports/dashboard
```

**Response:**
```json
{
  "success": true,
  "data": {
    "summary": {
      "orders": {
        "total": 1000,
        "pending": 50,
        "packing": 30,
        "shipping": 100,
        "completed": 800,
        "cancelled": 20
      },
      "videos": {
        "total": 900,
        "processed": 850,
        "pending": 50
      },
      "products": {
        "total": 500,
        "lowStock": 20
      },
      "revenue": {
        "total": 500000000,
        "average": 500000
      }
    },
    "recentOrders": [...],
    "ordersByStatus": [...]
  }
}
```

### 8.2 Báo cáo đơn hàng
```http
GET /reports/orders
```

### 8.3 Báo cáo doanh thu
```http
GET /reports/revenue
```

### 8.4 Hiệu suất nhân viên
```http
GET /reports/staff-performance
```

---

## 9. Return Management APIs

### 9.1 Danh sách yêu cầu hoàn trả
```http
GET /returns
```

### 9.2 Tạo yêu cầu hoàn trả
```http
POST /returns
```

**Request Body:**
```json
{
  "orderId": "uuid",
  "reason": "damaged | wrong_item | defective | not_as_described | other",
  "description": "string",
  "images": ["url1", "url2"]
}
```

### 9.3 Duyệt hoàn trả
```http
PUT /returns/:id/approve
```

### 9.4 Từ chối hoàn trả
```http
PUT /returns/:id/reject
```

---

## Error Codes

| Code | Description |
|------|-------------|
| 400 | Bad Request - Dữ liệu không hợp lệ |
| 401 | Unauthorized - Chưa xác thực |
| 403 | Forbidden - Không có quyền |
| 404 | Not Found - Không tìm thấy |
| 409 | Conflict - Dữ liệu đã tồn tại |
| 429 | Too Many Requests - Rate limit exceeded |
| 500 | Internal Server Error |

**Error Response Format:**
```json
{
  "success": false,
  "message": "Mô tả lỗi",
  "errors": [
    { "field": "email", "message": "Email không hợp lệ" }
  ]
}
```

---

## Roles & Permissions

### Roles
| Role | Description |
|------|-------------|
| super_admin | Quản trị viên cao nhất |
| admin | Quản trị viên shop |
| staff | Nhân viên đóng gói |
| customer | Khách hàng |

### Permission Matrix
| Feature | Super Admin | Admin | Staff | Customer |
|---------|-------------|-------|-------|----------|
| Quản lý Admin | ✓ | ✗ | ✗ | ✗ |
| Quản lý Staff | ✓ | ✓ | ✗ | ✗ |
| Xem đơn hàng | ✓ | ✓ | ✓ | ✓ (của mình) |
| Tạo đơn hàng | ✓ | ✓ | ✗ | ✓ |
| Upload video | ✓ | ✓ | ✓ | ✗ |
| Phê duyệt video | ✓ | ✓ | ✗ | ✗ |
| Xem báo cáo | ✓ | ✓ | ✗ | ✗ |
| Cài đặt hệ thống | ✓ | ✗ | ✗ | ✗ |
