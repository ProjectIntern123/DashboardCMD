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

:: Step 4: Database Safety Check & Safe Initialization
echo [STEP 4/6] Checking Database State & Protecting Existing Records...

:: Production environment lock: fail-closed to protect production environments
if /i "%NODE_ENV%"=="production" goto PROD_LOCKED
if /i "%APP_ENV%"=="production" goto PROD_LOCKED

pushd backend
call npx prisma generate
if !ERRORLEVEL! NEQ 0 (
    echo [ERROR] Prisma client generation failed.
    popd
    goto ERROR
)
popd

node scripts/check-db-init.js
set DB_STATE=%ERRORLEVEL%

if "%DB_STATE%"=="10" (
    echo -------------------------------------------------------------------------
    echo [SAFETY NOTICE] Active database with existing objects detected!
    echo [SAFETY NOTICE] Skipping 'db push' and 'db seed' to protect existing data.
    echo [INFO] For ongoing production updates, use deploy-production.sh
    echo -------------------------------------------------------------------------
    goto STEP_BUILD
)
if "%DB_STATE%"=="0" (
    echo [INFO] Clean empty development database detected. Performing initial schema creation...
    pushd backend
    call npx prisma db push
    if !ERRORLEVEL! NEQ 0 (
        echo [ERROR] Initial schema push failed.
        popd
        goto ERROR
    )
    popd
    echo [SUCCESS] Initial schema created safely without data loss.
    echo.
    echo [STEP 5/6] Database Seeding Status...
    echo [NOTICE] Automatic seeding is disabled to guarantee zero unintended records.
    echo [NOTICE] For staging environments, use scripts\init-staging-db.sh.
    goto STEP_BUILD
)

echo [ERROR] Database verification failed (exit code %DB_STATE%). Halting setup to prevent data loss.
goto ERROR

:STEP_BUILD
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
echo Administrator Setup:
echo   - Automatic seeding is disabled to protect against default credentials.
echo   - Create an administrator explicitly using:
echo     node scripts/create-admin.js <email> <password> [name] [initials]
echo.
echo You can now start the application anytime by double-clicking 'run.bat'.
echo.
pause
exit /b 0

:PROD_LOCKED
echo.
echo =========================================================================
echo [PRODUCTION SAFETY LOCK] setup.bat is strictly for local development only.
echo Automatic schema push and seeding are completely disabled in production.
echo For production deployment, use: ./scripts/deploy-production.sh
echo =========================================================================
pause
exit /b 1

:ERROR
echo.
echo =========================================================================
echo                 [!] SETUP FAILED WITH ERRORS
echo =========================================================================
echo Please address the error listed above and re-run setup.bat.
pause
exit /b 1
