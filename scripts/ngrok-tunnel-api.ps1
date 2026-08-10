# Túnel ngrok hacia la API local (:4001) para webhooks MixerGaming.
# Uso (desde la raíz del repo):
#   .\scripts\ngrok-tunnel-api.ps1
# Primera vez: .\scripts\ngrok.cmd config add-authtoken TU_TOKEN

$ngrokExe = Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Packages\Ngrok.Ngrok_Microsoft.Winget.Source_8wekyb3d8bbwe\ngrok.exe"

if (-not (Test-Path $ngrokExe)) {
  Write-Error "ngrok no encontrado. Instalar: winget install Ngrok.Ngrok"
  exit 1
}

Write-Host "Webhook MixerGaming: https://TU-SUBDOMINIO.ngrok-free.app/webhooks/payments/mixer-gaming"
Write-Host "Inspector: http://127.0.0.1:4040"
& $ngrokExe http 4001
