@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Utopia Launcher

echo ============================================
echo   Utopia - Study Platform
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

set NEED_BUILD=0
if not exist ".next\BUILD_ID" set NEED_BUILD=1
if "%NEED_BUILD%"=="1" goto do_build
powershell -NoProfile -Command "$b=(Get-Item '.next\BUILD_ID').LastWriteTime; $s=(Get-ChildItem -Path 'src','public','package.json','next.config.ts','tailwind.config.ts','tsconfig.json' -Recurse -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1).LastWriteTime; if ($s -gt $b) { exit 1 } else { exit 0 }" >nul 2>nul
if errorlevel 1 set NEED_BUILD=1
:do_build
if "%NEED_BUILD%"=="0" goto have_build
echo [INFO] Building production bundle (about 1 minute)...
call npm run build
if errorlevel 1 goto build_failed
echo.

:have_build

echo [INFO] Starting server...
start "Utopia Web Server" cmd /k "npm start"
ping -n 6 127.0.0.1 >nul
start "" http://localhost:8080

echo.
echo [OK] Opened http://localhost:8080
echo [OK] Access password: see .env
echo [OK] You can close this window.
echo [OK] To stop the server, close the "Utopia Web Server" window.
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

:build_failed
echo.
echo [ERROR] Build failed. Check the log above.
pause
exit /b 1