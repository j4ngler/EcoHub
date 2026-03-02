# Script để regenerate Prisma client trong Docker container
Write-Host "Regenerating Prisma client in Docker container..." -ForegroundColor Yellow

# Kiểm tra xem container có đang chạy không
$containerName = "ecohub-backend"
$containerRunning = docker ps --filter "name=$containerName" --format "{{.Names}}"

if ($containerRunning -eq $containerName) {
    Write-Host "Container đang chạy. Regenerating Prisma client..." -ForegroundColor Green
    docker exec $containerName npx prisma generate
    Write-Host "Prisma client đã được regenerate. Đang restart container..." -ForegroundColor Green
    docker restart $containerName
    Write-Host "Hoàn tất!" -ForegroundColor Green
} else {
    Write-Host "Container không chạy. Đang rebuild container..." -ForegroundColor Yellow
    docker-compose build backend
    docker-compose up -d backend
    Write-Host "Hoàn tất!" -ForegroundColor Green
}
