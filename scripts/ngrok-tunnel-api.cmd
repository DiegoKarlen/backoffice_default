@echo off
REM Tunel ngrok -> localhost:4001 (API). Mantener esta ventana abierta.
set "NGROK_EXE=%LOCALAPPDATA%\Microsoft\WinGet\Packages\Ngrok.Ngrok_Microsoft.Winget.Source_8wekyb3d8bbwe\ngrok.exe"

if not exist "%NGROK_EXE%" (
  echo [ERROR] ngrok no instalado. Ejecuta: winget install Ngrok.Ngrok
  pause
  exit /b 1
)

echo.
echo Asegurate de que la API corre en http://localhost:4001
echo.
echo Webhook para MixerGaming:
echo   https://TU-SUBDOMINIO.ngrok-free.app/webhooks/payments/mixer-gaming
echo.
echo Inspector de requests: http://127.0.0.1:4040
echo.
"%NGROK_EXE%" http 4001
