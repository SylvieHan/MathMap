@echo off
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo.
  echo   Node.js is not installed.
  echo   Install Node.js 20+ from https://nodejs.org/
  echo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo.
  echo   First run — installing dependencies ^(one time^)...
  echo.
  call npm install
)

echo.
echo   MathMap editor starting...
echo   Your browser will open automatically when ready.
echo   Keep this window open while editing. Close it to stop.
echo.

call npm run dev -- --open --port 5173 --strictPort
pause
