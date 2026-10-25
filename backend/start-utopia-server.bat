@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Utopia Distribution

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found. Install it from https://nodejs.org/
  pause
  exit /b 1
)

set PORT=8081
echo Starting Utopia distribution service on port %PORT% ...
start "Utopia Distribution Server" cmd /k "node server.js"
ping -n 3 127.0.0.1 >nul
start "" http://localhost:%PORT%/

echo.
echo [OK] Opened http://localhost:%PORT%/
echo [OK] Close the "Utopia Distribution Server" window to stop.
ping -n 4 127.0.0.1 >nul
exit /b 0
