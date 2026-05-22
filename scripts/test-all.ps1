# Batería de tests y builds — backoffice_default
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

Write-Host "=== @backoffice/shared (unit) ===" -ForegroundColor Cyan
Push-Location $root
npm run test:shared
if ($LASTEXITCODE -ne 0) { Pop-Location; exit $LASTEXITCODE }

Write-Host "=== API unit (no DB) ===" -ForegroundColor Cyan
Push-Location "$root\api"
npm run test:unit
if ($LASTEXITCODE -ne 0) { Pop-Location; Pop-Location; exit $LASTEXITCODE }
Pop-Location

Write-Host "=== API integration (DB) ===" -ForegroundColor Cyan
Push-Location "$root\api"
npm run test:integration
if ($LASTEXITCODE -ne 0) { Pop-Location; Pop-Location; exit $LASTEXITCODE }
Pop-Location

Write-Host "=== API build ===" -ForegroundColor Cyan
Push-Location "$root\api"
npm run build
if ($LASTEXITCODE -ne 0) { Pop-Location; Pop-Location; exit $LASTEXITCODE }
Pop-Location

Write-Host "=== player-portal build ===" -ForegroundColor Cyan
Push-Location "$root\player-portal"
npm run build
if ($LASTEXITCODE -ne 0) { Pop-Location; Pop-Location; exit $LASTEXITCODE }
Pop-Location

Write-Host "=== bingo-display build ===" -ForegroundColor Cyan
Push-Location "$root\bingo-display"
npm run build
if ($LASTEXITCODE -ne 0) { Pop-Location; Pop-Location; exit $LASTEXITCODE }
Pop-Location

Pop-Location
Write-Host "`nAll checks passed." -ForegroundColor Green
Write-Host "Tip: npm run test:api:prizes  |  npm run test:api:wallet  |  cd api && npm run test:list" -ForegroundColor DarkGray
