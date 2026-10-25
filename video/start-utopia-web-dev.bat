@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Utopia Dev Mode

echo ============================================
echo   Utopia - Dev Mode (auto reload)
echo ============================================
echo.

where node >nul 2>nul
if errorlevel 1 goto no_node

if exist ".env" goto have_env
echo [INFO] .env not found. Creating it with default password: utopia2026
echo [INFO] Please change the password in .env later.
>".env" echo PASSWORD=utopia2026
:have_env

if exist "node_modules" goto have_deps
echo [INFO] First run: installing dependencies (may take a few minutes)...
call npm install --no-audit --no-fund
if errorlevel 1 goto install_failed
echo.

:have_deps

echo [INFO] Starting dev server...
start "Utopia Dev Server" cmd /k "npm run dev"
ping -n 7 127.0.0.1 >nul
start "" http://localhost:8080

echo.
echo [OK] Opened http://localhost:8080
echo [OK] Edit code and the page will refresh automatically.
echo [OK] You can close this window.
echo [OK] To stop the server, close the "Utopia Dev Server" window.
ping -n 5 127.0.0.1 >nul
exit /b 0

:no_node
echo [ERROR] Node.js not found. Please install Node.js 18 or newer:
echo         https://nodejs.org/
echo.
pause
exit /b 1

:install_failed
echo.
echo [ERROR] Failed to install dependencies. Check your network and retry.
pause
exit /b 1