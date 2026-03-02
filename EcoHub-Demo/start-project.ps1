# Script tự động khởi động Docker và chạy migration
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  KHỞI ĐỘNG DỰ ÁN ECOHUB" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Kiểm tra Docker Desktop
Write-Host "[1/4] Kiểm tra Docker Desktop..." -ForegroundColor Yellow
$dockerRunning = $false
$maxAttempts = 30
$attempt = 0

while (-not $dockerRunning -and $attempt -lt $maxAttempts) {
    try {
        docker ps 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) {
            $dockerRunning = $true
            Write-Host "✅ Docker Desktop đã sẵn sàng!" -ForegroundColor Green
        }
    } catch {
        # Docker chưa sẵn sàng
    }
    
    if (-not $dockerRunning) {
        $attempt++
        Write-Host "   Đang đợi Docker Desktop khởi động... ($attempt/$maxAttempts)" -ForegroundColor Gray
        Start-Sleep -Seconds 2
    }
}

if (-not $dockerRunning) {
    Write-Host "❌ Docker Desktop chưa sẵn sàng sau $maxAttempts lần thử." -ForegroundColor Red
    Write-Host "Vui lòng khởi động Docker Desktop thủ công và chạy lại script này." -ForegroundColor Yellow
    exit 1
}

# Khởi động Docker Compose
Write-Host ""
Write-Host "[2/4] Khởi động Docker Compose services..." -ForegroundColor Yellow
docker compose up -d

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Không thể khởi động Docker Compose services." -ForegroundColor Red
    exit 1
}

Write-Host "✅ Docker Compose services đã khởi động!" -ForegroundColor Green

# Đợi PostgreSQL sẵn sàng
Write-Host ""
Write-Host "[3/4] Đợi PostgreSQL sẵn sàng..." -ForegroundColor Yellow
$dbReady = $false
$dbAttempts = 0
while (-not $dbReady -and $dbAttempts -lt 30) {
    $dbAttempts++
    $result = docker compose exec -T postgres pg_isready -U postgres 2>&1
    if ($result -match "accepting connections") {
        $dbReady = $true
        Write-Host "✅ PostgreSQL đã sẵn sàng!" -ForegroundColor Green
    } else {
        Write-Host "   Đang đợi PostgreSQL... ($dbAttempts/30)" -ForegroundColor Gray
        Start-Sleep -Seconds 2
    }
}

# Chạy Migration
Write-Host ""
Write-Host "[4/4] Chạy database migration..." -ForegroundColor Yellow
docker compose exec -T backend npx prisma migrate deploy

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Migration thành công!" -ForegroundColor Green
} else {
    Write-Host "⚠️  Migration có thể đã được chạy trước đó hoặc có lỗi." -ForegroundColor Yellow
    Write-Host "   Kiểm tra logs: docker compose logs backend" -ForegroundColor Gray
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  DỰ ÁN ĐÃ SẴN SÀNG!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Frontend:  http://localhost:5173" -ForegroundColor Cyan
Write-Host "Backend:   http://localhost:3000" -ForegroundColor Cyan
Write-Host "API Docs:  http://localhost:3000/api/docs" -ForegroundColor Cyan
Write-Host ""
Write-Host "Để xem logs: docker compose logs -f" -ForegroundColor Gray
Write-Host "Để dừng:     docker compose down" -ForegroundColor Gray
