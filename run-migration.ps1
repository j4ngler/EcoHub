# Script để chạy migration Prisma trong Docker container
Write-Host "Đang chạy migration Prisma..." -ForegroundColor Green

docker compose exec backend npx prisma migrate deploy

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Migration thành công!" -ForegroundColor Green
} else {
    Write-Host "❌ Migration thất bại. Vui lòng kiểm tra Docker đã chạy chưa." -ForegroundColor Red
    Write-Host "Chạy: docker compose up -d" -ForegroundColor Yellow
}
