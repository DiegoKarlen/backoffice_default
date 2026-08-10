@echo off
REM Configura el authtoken de ngrok (solo la primera vez).
REM Uso: doble clic en este archivo, o desde cmd:
REM   scripts\setup-ngrok-token.cmd TU_TOKEN

set "NGROK_EXE=%LOCALAPPDATA%\Microsoft\WinGet\Packages\Ngrok.Ngrok_Microsoft.Winget.Source_8wekyb3d8bbwe\ngrok.exe"

if not exist "%NGROK_EXE%" (
  echo.
  echo [ERROR] ngrok no esta instalado.
  echo Instalar con: winget install Ngrok.Ngrok
  echo.
  pause
  exit /b 1
)

set "TOKEN=%~1"

if "%TOKEN%"=="" (
  echo.
  echo === Configurar token de ngrok ===
  echo.
  echo 1. Abri https://dashboard.ngrok.com/get-started/your-authtoken
  echo 2. Copia tu authtoken
  echo 3. Pegalo aca y presiona Enter
  echo.
  set /p TOKEN=Authtoken: 
)

if "%TOKEN%"=="" (
  echo.
  echo [ERROR] No ingresaste un token.
  echo.
  pause
  exit /b 1
)

echo.
echo Configurando token...
"%NGROK_EXE%" config add-authtoken %TOKEN%

if errorlevel 1 (
  echo.
  echo [ERROR] No se pudo configurar el token.
  pause
  exit /b 1
)

echo.
echo [OK] Token configurado correctamente.
echo.
echo Proximo paso - levantar el tunel hacia la API:
echo   scripts\ngrok-tunnel-api.cmd
echo.
pause
