Write-Host "Testing Lumina API..." -ForegroundColor Cyan
Write-Host ""

# Test 1: Root endpoint
Write-Host "1️⃣  Testing GET /" -ForegroundColor Cyan
try {
    $root = (curl.exe -s http://localhost:8000/ 2>$null)
    Write-Host "   Response: $root" -ForegroundColor Green
} catch {
    Write-Host "   ❌ Failed: $_" -ForegroundColor Red
}

# Test 2: Health check
Write-Host "`n2️⃣  Testing GET /health" -ForegroundColor Cyan
try {
    $health = (curl.exe -s http://localhost:8000/health 2>$null)
    Write-Host "   Response: $health" -ForegroundColor Green
} catch {
    Write-Host "   ❌ Failed: $_" -ForegroundColor Red
}

# Test 3: Database check
Write-Host "`n3️⃣  Testing GET /db-check" -ForegroundColor Cyan
try {
    $dbCheck = (curl.exe -s http://localhost:8000/db-check 2>$null)
    Write-Host "   Response: $dbCheck" -ForegroundColor Green
} catch {
    Write-Host "   ❌ Failed: $_" -ForegroundColor Red
}

# Test 4: API Docs
Write-Host "`n4️⃣  Testing GET /docs (Swagger UI)" -ForegroundColor Cyan
try {
    $statusCode = (curl.exe -s -o $null -w "%{http_code}" http://localhost:8000/docs 2>$null)
    if ($statusCode -eq "200") {
        Write-Host "   ✅ Swagger UI available at http://localhost:8000/docs" -ForegroundColor Green
    }
} catch {
    Write-Host "   ❌ Failed: $_" -ForegroundColor Red
}

Write-Host "`n✅ API is working! Ready to deploy to Render." -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Go to Render.com and create a new Web Service" -ForegroundColor Yellow
Write-Host "  2. Connect your GitHub repository" -ForegroundColor Yellow
Write-Host "  3. Set the environment variables in Render dashboard" -ForegroundColor Yellow
Write-Host "  4. Deploy!" -ForegroundColor Yellow
