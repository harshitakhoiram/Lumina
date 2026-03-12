# Local development startup script for Windows PowerShell

Write-Host "=== Lumina Local Development Startup ===" -ForegroundColor Cyan
Write-Host ""

# Check if Docker is running
try {
    docker ps > $null 2>&1
} catch {
    Write-Host "ERROR: Docker is not installed or not running" -ForegroundColor Red
    exit 1
}

# Check for .env file
if (!(Test-Path "backend/.env")) {
    Write-Host "Creating .env from template..." -ForegroundColor Yellow
    Copy-Item "backend/.env.example" "backend/.env"
    Write-Host "WARNING: Please edit backend/.env with your API keys before proceeding" -ForegroundColor Yellow
    Write-Host ""
}

# Start Docker Compose
Write-Host "Starting services with Docker Compose..." -ForegroundColor Cyan
Write-Host ""
docker-compose up

Write-Host ""
Write-Host "=== Services Started ===" -ForegroundColor Green
Write-Host "API: http://localhost:8000" -ForegroundColor Green
Write-Host "API Docs: http://localhost:8000/docs" -ForegroundColor Green
Write-Host "Database: localhost:5432" -ForegroundColor Green
Write-Host ""
Write-Host "To stop: Press Ctrl+C" -ForegroundColor Yellow
