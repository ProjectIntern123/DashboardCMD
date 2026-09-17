@echo off
setlocal enabledelayedexpansion

echo =========================================================================
echo       HARTEK GROUP CMD OFFICE COMMAND CENTER - APPLICATION LAUNCHER
echo =========================================================================
echo.

if not exist ".env" (
    echo [WARNING] .env file not found. Running quick environment sync...
    if exist ".env.example" copy .env.example .env >nul
)

:: Synchronize environment files
call npm run sync-env

echo.
echo Starting Backend API Server (Port 4000) and Frontend Application (Port 3000)...
echo.
echo Access URLs:
echo   - Web Dashboard: http://localhost:3000
echo   - Backend API:   http://localhost:4000/api
echo.
echo Press Ctrl+C in this window at any time to shut down both servers.
echo =========================================================================
echo.

:: Automatically open browser after 3 seconds delay
start "" powershell -Command "Start-Sleep -s 3; Start-Process 'http://localhost:3000'" >nul 2>&1

:: Start development / watch servers concurrently
call npm run dev

pause
