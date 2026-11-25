@echo off
title Lumen
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js is not installed yet.
  echo   1. Go to https://nodejs.org and install the LTS version
  echo   2. Then double-click this file again
  echo.
  start https://nodejs.org
  pause
  exit /b
)
node server.js --open
echo.
echo Lumen stopped. If you saw an error above, take a screenshot of this window.
pause
