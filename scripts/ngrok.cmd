@echo off
set "NGROK_EXE=%LOCALAPPDATA%\Microsoft\WinGet\Packages\Ngrok.Ngrok_Microsoft.Winget.Source_8wekyb3d8bbwe\ngrok.exe"
if not exist "%NGROK_EXE%" (
  echo ngrok no encontrado. Instalar: winget install Ngrok.Ngrok
  exit /b 1
)
"%NGROK_EXE%" %*
