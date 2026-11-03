@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Utopia Launcher

:menu
cls
echo ==================================================
echo    Utopia - Study Platform
echo ==================================================
echo.
echo    [1] Web app          http://localhost:8080
echo    [2] Web dev mode     hot reload, port 8080
echo    [3] Desktop client   Electron, port 3210
echo    [4] Open docs folder
echo    [0] Exit
echo.
set /p "choice=Select [0-4]: "

if "%choice%"=="1" goto web
if "%choice%"=="2" goto webdev
if "%choice%"=="3" goto desktop
if "%choice%"=="4" goto docs
if "%choice%"=="0" exit /b 0
goto menu

:web
start "" "%~dp0video\start-utopia-web.bat"
exit /b 0

:webdev
start "" "%~dp0video\start-utopia-web-dev.bat"
exit /b 0

:desktop
if not exist "%~dp0desktop\node_modules" (
  echo Desktop client needs dependencies. Run: cd desktop ^&^& npm install
  pause
  exit /b 0
)
start "" "npm" /D "%~dp0desktop" start
exit /b 0

:docs
start "" "%~dp0docs"
exit /b 0