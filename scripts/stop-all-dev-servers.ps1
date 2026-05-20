<#
.SYNOPSIS
  Detiene los servidores de desarrollo del workspace backoffice_default.

.DESCRIPTION
  1) Termina procesos node.exe cuya línea de comando incluye la carpeta del proyecto.
  2) Termina lo que esté escuchando en los puertos habituales (API, webpack BO, Vite apps, Prisma Studio).

  Ejecutar desde la raíz del repo:
    .\scripts\stop-all-dev-servers.ps1
#>

$ErrorActionPreference = "SilentlyContinue"

$projectRoot = Split-Path -Parent $PSScriptRoot
$projectMarker = [regex]::Escape((Split-Path -Leaf $projectRoot))

Write-Host ""
Write-Host "Deteniendo servidores de desarrollo ($projectMarker)..." -ForegroundColor Cyan

$nodeKilled = 0
Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | ForEach-Object {
    $cmd = $_.CommandLine
    if (-not $cmd) { return }
    if ($cmd -notmatch $projectMarker) { return }
    # No tocar procesos Node del IDE (Cursor/VS Code suelen llevar .cursor o extensiones en AppData)
    if ($cmd -match '[\\/]\.cursor[\\/]|Cursor[\\/]User[\\/]|vscode[\\/]|Visual Studio Code[\\/]') {
        return
    }
    Write-Host "  Node (proyecto) PID $($_.ProcessId)" -ForegroundColor DarkGray
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    $nodeKilled++
}
Write-Host "  Procesos Node del repo: $nodeKilled" -ForegroundColor $(if ($nodeKilled) { "Yellow" } else { "DarkGray" })

# Puertos típicos: API (PORT), webpack devServer BO (4000 dev), bingo-display (5174), player-portal (5175), prisma studio (5555)
$ports = @(4000, 4001, 5174, 5175, 5555)
$portKilled = 0
foreach ($port in $ports) {
    $listeners = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    foreach ($l in $listeners) {
        $pid = $l.OwningProcess
        if (-not $pid) { continue }
        $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
        $name = if ($proc) { $proc.ProcessName } else { "?" }
        Write-Host "  Puerto $port -> PID $pid ($name)" -ForegroundColor DarkGray
        Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
        $portKilled++
    }
}
Write-Host "  Procesos por puerto: $portKilled" -ForegroundColor $(if ($portKilled) { "Yellow" } else { "DarkGray" })

Write-Host ""
Write-Host "Listo." -ForegroundColor Green
Write-Host ""
