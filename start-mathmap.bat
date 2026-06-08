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
echo   Browser: http://localhost:5173
echo   Keep this window open while editing. Close it to stop.
echo.

start "" "http://localhost:5173"
call npm run dev
pause
