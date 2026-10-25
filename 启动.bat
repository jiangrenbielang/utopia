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
echo    [3] Mobile web + APK download  http://localhost:8081
echo    [4] Open docs folder
echo    [5] Local HD companion  (Bilibili + mpv)
echo    [0] Exit
echo.
set /p "choice=Select [0-5]: "

if "%choice%"=="1" goto web
if "%choice%"=="2" goto webdev
if "%choice%"=="3" goto mobile
if "%choice%"=="4" goto docs
if "%choice%"=="5" goto companion
if "%choice%"=="0" exit /b 0
goto menu

:web
start "" "%~dp0video\start-utopia-web.bat"
exit /b 0

:webdev
start "" "%~dp0video\start-utopia-web-dev.bat"
exit /b 0

:mobile
start "" "%~dp0backend\start-utopia-server.bat"
exit /b 0

:docs
start "" "%~dp0docs"
exit /b 0

:companion
if not exist "%~dp0companion\start-utopia-companion.bat" (
  echo Companion is not included in this repository.
  echo Keep your local companion folder at .\companion\.
  pause
  exit /b 0
)
start "" "%~dp0companion\start-utopia-companion.bat"
exit /b 0
