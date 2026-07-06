# EcoHub

EcoHub là web app TypeScript cho quản lý đơn hàng, kết nối TikTok Shop/Shopee, quay video đóng gói/hoàn hàng và lưu trữ video lên S3.

## Cấu trúc

```text
EcoHub-Demo/
  backend/              API Node.js + Express + Prisma
  frontend/             React + Vite + TypeScript
  nginx/                Reverse proxy và static serving
  docker-compose.yml    Môi trường Docker mặc định
  docker-compose.prod.yml
  .env.example          Mẫu biến môi trường
```

Các lệnh bên dưới mặc định chạy trong thư mục `EcoHub-Demo/`.

## Yêu cầu

- Node.js 20+
- npm 10+
- Docker và Docker Compose
- PostgreSQL 15 nếu chạy DB ngoài Docker
- Redis nếu chạy cache ngoài Docker

## Chạy nhanh bằng Docker

1. Tạo file môi trường:

```bash
cd EcoHub-Demo
cp .env.example .env
```

2. Cập nhật các biến quan trọng trong `.env` nếu cần:

```env
FRONTEND_URL=http://localhost
BACKEND_PUBLIC_URL=http://localhost

JWT_SECRET=change_me
JWT_REFRESH_SECRET=change_me

AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=hn-2
AWS_S3_BUCKET=video
AWS_S3_ENDPOINT=https://s3.hn-2.cloud.cmctelecom.vn
AWS_S3_FORCE_PATH_STYLE=true

TIKTOK_APP_KEY=
TIKTOK_APP_SECRET=

SHOPEE_ENV=test
SHOPEE_PARTNER_ID=
SHOPEE_PARTNER_KEY=
```

3. Build và chạy stack:

```bash
docker compose up -d --build
```

4. Chạy migration:

```bash
docker compose run --rm backend npx prisma migrate deploy
```

5. Seed dữ liệu mẫu, nếu cần:

```bash
docker compose run --rm backend npm run db:seed
```

6. Mở web:

```text
http://localhost
```

Nếu chạy trên server public, thay `FRONTEND_URL`, `BACKEND_PUBLIC_URL`, callback TikTok/Shopee và cấu hình Nginx theo IP/domain thật.

## Chạy local để phát triển

1. Cài dependencies:

```bash
cd EcoHub-Demo
npm install
```

2. Chạy PostgreSQL và Redis bằng Docker:

```bash
docker compose up -d postgres redis
```

3. Tạo env backend:

```bash
cp backend/.env.example backend/.env
```

Nếu không có `backend/.env.example`, dùng `.env.example` ở root làm mẫu và đặt `DATABASE_URL`:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ecohub?schema=public
REDIS_URL=redis://localhost:6379
```

4. Generate Prisma Client và migrate:

```bash
npm run db:migrate --workspace=backend
```

Hoặc:

```bash
cd backend
npx prisma generate
npx prisma migrate dev
```

5. Chạy dev server:

```bash
npm run dev
```

Mặc định:

```text
Backend:  http://localhost:3000
Frontend: http://localhost:5173
```

## Build production

```bash
npm run build
```

Build riêng từng phần:

```bash
npm run build --workspace=backend
npm run build --workspace=frontend
```

## Deploy lên server bằng Docker Compose

Trên server:

```bash
cd /path/to/EcoHub
git pull origin main
cd EcoHub-Demo

docker compose build --no-cache backend frontend nginx
docker compose run --rm backend npx prisma migrate deploy
docker compose up -d
docker compose logs backend --tail=100
```

Nếu Nginx đang serve static từ `frontend/dist`, build frontend và copy dist vào đúng container/static root:

```bash
docker compose exec frontend npm run build
docker cp ecohub-frontend:/app/dist/. ./frontend/dist/
docker cp ./frontend/dist/. ecohub-nginx:/usr/share/nginx/html/
docker compose exec nginx nginx -s reload
```

Kiểm tra bundle public:

```bash
curl -s http://127.0.0.1/login | grep -o 'assets/index-[^"]*\.js'
```

## Lệnh kiểm tra thường dùng

```bash
docker compose ps
docker compose logs backend --tail=200
docker compose logs nginx --tail=100
docker compose exec backend npx prisma migrate status
docker compose exec backend node -e "const {RoleName}=require('@prisma/client'); console.log(RoleName)"
docker compose exec postgres psql -U postgres -d ecohub -c '\dt'
```

## Ghi chú vận hành

- Không commit `.env`, private key, video, log, `node_modules`, `dist`, `uploads`.
- Sau khi thay đổi `schema.prisma`, phải rebuild backend hoặc chạy `npx prisma generate`.
- Callback TikTok/Shopee phải khớp tuyệt đối URL đã khai báo trong console của sàn.
- Camera USB dùng trực tiếp từ browser/local machine; RTSP camera nên đặt edge/capture service cùng LAN với camera trong môi trường production.
