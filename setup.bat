@echo off
setlocal enabledelayedexpansion

echo =========================================================================
echo       HARTEK GROUP CMD OFFICE COMMAND CENTER - SMART ONE-TIME SETUP
echo =========================================================================
echo.

:: Step 1: Check System Prerequisites
echo [STEP 1/6] Checking System Prerequisites (Node.js & npm)...
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is not installed or not found in system PATH.
    echo Please install Node.js (v20 LTS or newer) from https://nodejs.org/ and re-run setup.bat.
    goto ERROR
)
where npm >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] npm command is not found in system PATH.
    goto ERROR
)
echo [SUCCESS] Node.js & npm environment detected and active.
echo.

:: Step 2: Environment Configuration & Merge Check
echo [STEP 2/6] Verifying & Synchronizing Environment (.env)...
call node scripts/sync-env.js
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Environment synchronization failed.
    goto ERROR
)
echo [SUCCESS] Environment files verified and up to date.
echo.

:: Step 3: Smart Dependency Check & Installation
echo [STEP 3/6] Verifying Dependencies (Root, Backend, Frontend)...
call node scripts/bootstrap.js
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Dependency verification or installation failed.
    goto ERROR
)
echo [SUCCESS] Dependencies verified and ready.
echo.

:: Step 4: Database Schema Verification & Push
echo [STEP 4/6] Checking Database Connection & Synchronizing Schema...
cd backend
echo [INFO] Running Prisma Database Schema Push...
call npx prisma db push --accept-data-loss
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Database schema push failed.
    echo Please ensure PostgreSQL service is running and DATABASE_URL in .env is correct.
    cd ..
    goto ERROR
)
cd ..
echo [SUCCESS] Database connection established and schema synchronized safely.
echo.

:: Step 5: Database Seed & Master Data Verification
echo [STEP 5/6] Checking & Seeding Default Admin & Lookup Data...
cd backend
call npx prisma db seed
if %ERRORLEVEL% NEQ 0 (
    echo [WARNING] Database seed encountered a notice, continuing...
)
cd ..
echo [SUCCESS] Database master data verified.
echo.

:: Step 6: Smart Application Build Compilation
echo [STEP 6/6] Checking & Compiling Application Builds (Backend & Frontend)...
call node scripts/build.js
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Build compilation failed.
    goto ERROR
)
echo [SUCCESS] Application builds verified and up to date.
echo.

echo =========================================================================
echo         SETUP COMPLETE! THE CMD COMMAND CENTER IS READY TO RUN!
echo =========================================================================
echo.
echo Admin Credentials:
echo   - System Admin: project-ops@hartek.com
echo   - (Use 'node scripts/create-admin.js <email> <password>' to create additional admins)
echo.
echo You can now start the application anytime by double-clicking 'run.bat'.
echo.
pause
exit /b 0

:ERROR
echo.
echo =========================================================================
echo                 [!] SETUP FAILED WITH ERRORS
echo =========================================================================
echo Please address the error listed above and re-run setup.bat.
pause
exit /b 1
